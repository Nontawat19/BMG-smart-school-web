import React, { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { firestore as db } from '../../firebase';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import { FaSchool, FaUserTie, FaUserGraduate, FaMapMarkerAlt, FaMoneyBillWave, FaUsers, FaTasks, FaChalkboardTeacher, FaDatabase, FaHdd, FaCloudDownloadAlt, FaCloudUploadAlt, FaTrashAlt, FaLayerGroup, FaEdit, FaTable, FaCertificate, FaHeartbeat, FaBoxOpen, FaCodeBranch, FaCalendarTimes, FaFileExcel } from 'react-icons/fa';
import MainLayout from "@/layouts/MainLayout";
import { getGroupPersonnel } from '@/utils/schoolUtils';
import { parseStudentBirthDateParts } from '@/utils/birthDateUtils';
import {
  buildFirebaseMonthlyUsageSummary,
  fetchSchoolDashboardSummary,
  fetchSchoolLicenseInfo,
  formatOps,
  formatTHB,
  getCurrentUsageMonth,
  getDaysUntilMaExpiry,
  isMaExpiringSoon,
  LICENSE_STATUS_LABELS,
  SYSTEM_VERSION,
  formatLastSyncTimestamp,
  type SchoolLicenseInfo,
} from '@/utils/ownerStatsUtils';

interface SchoolInfo {
  schoolName?: string;
  schoolCode?: string;
  schoolAbbreviation?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  affiliation?: string;
  directorPrefix?: string;
  directorName?: string;
  academicHeadPrefix?: string;
  academicHeadName?: string;
  budgetHeadPrefix?: string;
  budgetHeadName?: string;
  personnelHeadPrefix?: string;
  personnelHeadName?: string;
  generalHeadPrefix?: string;
  generalHeadName?: string;
  deputyPrefix?: string;
  deputyName?: string;
  deputyAcademicPrefix?: string;
  deputyAcademicName?: string;
  deputyBudgetPrefix?: string;
  deputyBudgetName?: string;
  deputyPersonnelPrefix?: string;
  deputyPersonnelName?: string;
  deputyGeneralPrefix?: string;
  deputyGeneralName?: string;
  studentSupportOfficerPrefix?: string;
  studentSupportOfficerName?: string;
  logoUrl?: string;
  teacherCount?: number;
  studentCount?: number;
  firestoreUsage?: string;
  storageUsage?: string;
  firestoreReads?: string;
  firestoreWrites?: string;
  firestoreUpdates?: string;
  firestoreDeletes?: string;
  firebaseMonthlyCost?: string;
  firebaseCostBreakdown?: string;
  usageMonth?: string;
  schoolType?: string;
  opportunityExpansionLevel?: string;
  lastSyncAt?: any;
}

const SkeletonLoader: React.FC = () => (
  <div className="animate-pulse">
    <div className="mb-6 flex justify-between items-center">
      <div className="h-5 w-48 bg-gray-300 dark:bg-gray-700 rounded"></div>
      <div className="h-10 w-28 bg-gray-300 dark:bg-gray-700 rounded-lg"></div>
    </div>

    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm dark:shadow-none">
      <div className="h-8 w-1/3 bg-gray-300 dark:bg-gray-700 rounded mb-6 pb-4 border-b border-gray-200 dark:border-gray-700"></div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 flex flex-col items-center text-center">
          <div className="w-40 h-40 rounded-full bg-gray-300 dark:bg-gray-700 mb-4"></div>
          <div className="h-7 w-3/4 bg-gray-300 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-4 w-1/2 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>

        <div className="md:col-span-8 divide-y divide-gray-300 dark:divide-gray-700">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-start py-3 first:pt-0 last:pb-0">
              <div className="w-5 h-5 bg-gray-300 dark:bg-gray-700 rounded-full mr-4 mt-1"></div>
              <div className="flex-grow">
                <div className="h-4 w-1/4 bg-gray-300 dark:bg-gray-700 rounded mb-2"></div>
                <div className="h-5 w-3/5 bg-gray-300 dark:bg-gray-700 rounded"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

const SchoolDetailsPage: React.FC = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<SchoolInfo | null>(null);
  const [licenseInfo, setLicenseInfo] = useState<SchoolLicenseInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingStudents, setIsExportingStudents] = useState(false);

  const collectionName = 'school-settings';

  const fetchData = useCallback(async () => {
    if (!schoolId) {
      setIsLoading(false);
      navigate('/owner/schools');
      return;
    }

    setIsLoading(true);
    try {
      const docRef = doc(db, collectionName, schoolId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as SchoolInfo;
        const [summary, license] = await Promise.all([
          fetchSchoolDashboardSummary(db, schoolId, data),
          fetchSchoolLicenseInfo(db, schoolId),
        ]);
        setLicenseInfo(license);
        const usageMonth = getCurrentUsageMonth();
        const monthlyUsage = summary.monthlyUsage?.[usageMonth] || buildFirebaseMonthlyUsageSummary({
          month: usageMonth,
          readOps: summary.firestoreDocumentCount || 0,
          updateOps: 2,
          firestoreUsageBytes: summary.firestoreUsageBytes || 0,
          storageUsageBytes: summary.storageUsageBytes || 0,
        });

        setInfo({
          ...data,
          teacherCount: summary.teacherCount,
          studentCount: summary.studentCount,
          firestoreUsage: summary.firestoreUsage,
          storageUsage: summary.storageUsage,
          firestoreReads: formatOps(monthlyUsage.readOps),
          firestoreWrites: formatOps(monthlyUsage.createOps),
          firestoreUpdates: formatOps(monthlyUsage.updateOps),
          firestoreDeletes: formatOps(monthlyUsage.deleteOps),
          firebaseMonthlyCost: formatTHB(monthlyUsage.cost.totalTHB),
          firebaseCostBreakdown: [
            `Firestore ops ${formatTHB(monthlyUsage.cost.firestoreOperationsTHB)}`,
            `Firestore storage ${formatTHB(monthlyUsage.cost.firestoreStorageTHB)}`,
            `Storage ${formatTHB(monthlyUsage.cost.storageTHB)}`,
            `Hosting storage ${formatTHB(monthlyUsage.cost.hostingStorageTHB)}`,
          ].join(' / '),
          usageMonth,
          lastSyncAt: (data as any).updatedAt,
        });
      } else {
        setInfo(null); // No data found
        Swal.fire('ไม่พบข้อมูล', 'ไม่พบข้อมูลโรงเรียนที่คุณกำลังมองหา', 'warning');
        navigate('/owner/schools');
      }
    } catch (error) {
      console.error("Error fetching school info:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงข้อมูลโรงเรียนได้', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [schoolId, navigate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleExportStudents = async () => {
    if (!schoolId) return;
    setIsExportingStudents(true);
    try {
      const snap = await getDocs(collection(db, 'school-settings', schoolId, 'students'));
      const rows = snap.docs
        .map(d => d.data() as Record<string, any>)
        .sort((a, b) => {
          const classCompare = String(a.classLevel || '').localeCompare(String(b.classLevel || ''), 'th');
          if (classCompare !== 0) return classCompare;
          const roomCompare = String(a.room || '').localeCompare(String(b.room || ''), 'th', { numeric: true });
          if (roomCompare !== 0) return roomCompare;
          return (Number(a.studentNumber) || 0) - (Number(b.studentNumber) || 0);
        })
        .map(s => {
          const birthParts = parseStudentBirthDateParts(s.birthDate);
          const birthDateText = birthParts
            ? `${String(birthParts.day).padStart(2, '0')}/${String(birthParts.month).padStart(2, '0')}/${birthParts.year >= 2400 ? birthParts.year : birthParts.year + 543}`
            : '';

          return {
            'ชื่อโรงเรียน': info?.schoolName || '',
            'ชั้น': s.classLevel || '',
            'ห้อง': s.room || '',
            'รหัสนักเรียน': s.studentId || '',
            'คำนำหน้าชื่อ': s.title || '',
            'ชื่อ': s.firstName || '',
            'นามสกุล': s.lastName || '',
            'วันเดือนปีเกิด': birthDateText,
            'เลขประจำตัวประชาชน': s.idCardNumber || '',
            'หมู่โลหิต': s.bloodType || '',
            'หมายเหตุ': '',
          };
        });

      if (rows.length === 0) {
        Swal.fire('ไม่พบข้อมูล', 'โรงเรียนนี้ยังไม่มีข้อมูลนักเรียน', 'info');
        return;
      }

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'นักเรียน');
      XLSX.writeFile(wb, `ข้อมูลนักเรียน_${info?.schoolName || schoolId}.xlsx`);
    } catch (error) {
      console.error('Error exporting students:', error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดาวน์โหลดข้อมูลนักเรียนได้', 'error');
    } finally {
      setIsExportingStudents(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300">
          <div className="max-w-4xl mx-auto">
            <SkeletonLoader />
          </div>
        </div>
      </MainLayout>
    );
  }

  const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value?: string }> = ({ icon, label, value }) => (
    <div className="flex items-start py-3">
      <div className="text-indigo-500 dark:text-indigo-400 mr-4 mt-1">{icon}</div>
      <div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
        <p className="font-semibold text-gray-900 dark:text-white">{value || '-'}</p>
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6 flex justify-between items-center">
            <Link to="/owner/schools" className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
              &larr; กลับหน้ารายการโรงเรียน
            </Link>
            {info && (
              <div className="flex items-center gap-2">
                <Link
                  to={`/owner/schools/${schoolId}/data`}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  <FaTable size={14} />
                  ดูข้อมูลทั้งหมดในโรงเรียน
                </Link>
                <Link to={`/owner/school-info/${schoolId}`} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                  แก้ไขข้อมูล
                </Link>
                <button
                  type="button"
                  onClick={handleExportStudents}
                  disabled={isExportingStudents}
                  className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                  <FaFileExcel size={14} />
                  {isExportingStudents ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด Excel นักเรียน'}
                </button>
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-6 shadow-sm dark:shadow-none">
            <h1 className="text-3xl font-bold mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">ข้อมูลโรงเรียน</h1>

            {info ? (
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                <div className="md:col-span-4 flex flex-col items-center text-center flex-shrink-0">
                  <div className="w-40 h-40 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center overflow-hidden border-2 border-gray-200 dark:border-gray-500 mb-4">
                    {info.logoUrl ? (
                      <img src={info.logoUrl} alt="School Logo" className="w-full h-full object-cover" />
                    ) : (
                      <FaSchool className="text-gray-400 dark:text-gray-500 text-5xl" />
                    )}
                  </div>
                  <h2 className="text-2xl font-bold text-center">{info.schoolName || 'ยังไม่มีชื่อโรงเรียน'}</h2>
                  <div className="flex flex-col items-center">
                    {info.schoolCode && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">รหัสสถานศึกษา: {info.schoolCode}</p>}
                    {info.schoolAbbreviation && (
                      <p className="text-gray-500 dark:text-gray-400">({info.schoolAbbreviation})</p>
                    )}
                  </div>
                  <p className="text-gray-500 dark:text-gray-400 mt-1">{info.affiliation || 'ยังไม่มีสังกัด'}</p>
                </div>

                <div className="md:col-span-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-b border-gray-200 dark:border-gray-700">
                    <InfoRow icon={<FaUserTie size={20} />} label="ผู้อำนวยการ" value={[info.directorPrefix, info.directorName].filter(Boolean).join(' ')} />
                    <InfoRow icon={<FaUserTie size={20} />} label="รองผู้อำนวยการ" value={[info.deputyPrefix, info.deputyName].filter(Boolean).join(' ')} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-b border-gray-200 dark:border-gray-700">
                    <InfoRow icon={<FaSchool size={20} />} label="ประเภทโรงเรียน" value={info.schoolType} />
                    <InfoRow icon={<FaLayerGroup size={20} />} label="ระดับชั้นที่เปิดสอน" value={info.opportunityExpansionLevel} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 border-b border-gray-200 dark:border-gray-700">
                    {(() => {
                      const academic = getGroupPersonnel(info, 'academic');
                      const budget = getGroupPersonnel(info, 'budget');
                      const personnel = getGroupPersonnel(info, 'personnel');
                      const general = getGroupPersonnel(info, 'general');
                      return (
                        <>
                          <InfoRow icon={<FaUserGraduate size={20} />} label={academic.label} value={academic.name} />
                          <InfoRow icon={<FaMoneyBillWave size={20} />} label={budget.label} value={budget.name} />
                          <InfoRow icon={<FaUsers size={20} />} label={personnel.label} value={personnel.name} />
                          <InfoRow icon={<FaTasks size={20} />} label={general.label} value={general.name} />
                        </>
                      );
                    })()}
                    <InfoRow icon={<FaUsers size={20} />} label="เจ้าหน้าที่ระบบดูแลช่วยเหลือนักเรียน" value={[info.studentSupportOfficerPrefix, info.studentSupportOfficerName].filter(Boolean).join(' ')} />
                  </div>
                  <div>
                    <InfoRow
                      icon={<FaMapMarkerAlt size={20} />}
                      label="ที่ตั้ง"
                      value={[info.subDistrict, info.district, info.province].filter(Boolean).join(' / ') || '-'}
                    />
                  </div>
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">ข้อมูลสถิติและการใช้งาน</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                      <InfoRow icon={<FaChalkboardTeacher size={20} />} label="จำนวนครู" value={`${info.teacherCount || 0} คน`} />
                      <InfoRow icon={<FaUserGraduate size={20} />} label="จำนวนนักเรียน" value={`${info.studentCount || 0} คน`} />
                      <InfoRow icon={<FaDatabase size={20} />} label="การใช้ข้อมูล (Firestore)" value={info.firestoreUsage} />
                      <InfoRow icon={<FaHdd size={20} />} label="พื้นที่จัดเก็บ (Storage)" value={info.storageUsage} />
                      <InfoRow icon={<FaCloudDownloadAlt size={20} />} label={`การอ่านข้อมูล (${info.usageMonth || 'เดือนนี้'})`} value={info.firestoreReads} />
                      <InfoRow icon={<FaCloudUploadAlt size={20} />} label={`การเขียนข้อมูล - เพิ่ม (${info.usageMonth || 'เดือนนี้'})`} value={info.firestoreWrites} />
                      <InfoRow icon={<FaEdit size={20} />} label={`การอัปเดตข้อมูล (${info.usageMonth || 'เดือนนี้'})`} value={info.firestoreUpdates} />
                      <InfoRow icon={<FaTrashAlt size={20} />} label={`การลบข้อมูล (${info.usageMonth || 'เดือนนี้'})`} value={info.firestoreDeletes} />
                      <InfoRow icon={<FaMoneyBillWave size={20} />} label="ต้นทุน Firebase (ประมาณ/เดือน)" value={info.firebaseMonthlyCost} />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-4">
                      * ops = operations สรุปรายเดือนจาก summaries; ต้นทุนเป็นค่าประมาณหลังหัก free tier และรวม Firestore, Storage, Hosting storage ({info.firebaseCostBreakdown || '-'})
                    </p>
                  </div>
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 text-gray-900 dark:text-white">License / MA / สัญญา</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                      <InfoRow
                        icon={<FaCertificate size={20} />}
                        label="สถานะ License"
                        value={licenseInfo?.licenseStatus ? LICENSE_STATUS_LABELS[licenseInfo.licenseStatus] : undefined}
                      />
                      <InfoRow
                        icon={<FaCalendarTimes size={20} />}
                        label="MA ถึงวันที่"
                        value={licenseInfo?.maExpiryDate ? `${licenseInfo.maExpiryDate}${isMaExpiringSoon(licenseInfo.maExpiryDate) ? ` (🔔 เหลือ ${getDaysUntilMaExpiry(licenseInfo.maExpiryDate)} วัน)` : ''}` : undefined}
                      />
                      <InfoRow icon={<FaCalendarTimes size={20} />} label="วันหมดอายุสัญญา" value={licenseInfo?.contractExpiryDate} />
                      <InfoRow icon={<FaBoxOpen size={20} />} label="Backup ล่าสุด" value={licenseInfo?.lastBackupAt} />
                      <InfoRow icon={<FaHeartbeat size={20} />} label="ซิงค์ข้อมูลล่าสุด" value={formatLastSyncTimestamp(info.lastSyncAt)} />
                      <InfoRow icon={<FaCodeBranch size={20} />} label="เวอร์ชันระบบ" value={SYSTEM_VERSION} />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-10">
                <p className="text-gray-500 dark:text-gray-400">ไม่พบข้อมูลโรงเรียนนี้</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default SchoolDetailsPage;
