import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { firestore as db, storage } from '../../firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { useDispatch } from 'react-redux';
import Swal from 'sweetalert2';
import { FaPlus, FaEdit, FaTrash, FaSchool, FaUserTie, FaSearch, FaChalkboardTeacher, FaUserGraduate, FaDatabase, FaHdd, FaServer } from 'react-icons/fa';
import { List, LayoutGrid } from 'lucide-react';
import MainLayout from "@/layouts/MainLayout";
import {
  fetchSchoolDashboardSummary,
  fetchOwnerDashboardSummary,
  getSchoolDashboardSummaryRef,
  isActiveStudentSummaryStatus,
  isActiveTeacherSummaryStatus,
  refreshOwnerDashboardSummaryFromCounts,
  updateOwnerDashboardSummary,
  writeOwnerDashboardSummaryFromSchools,
  fetchSchoolLicenseInfo,
  getDaysUntilMaExpiry,
  isMaExpiringSoon,
  LICENSE_STATUS_LABELS,
  SYSTEM_VERSION,
  formatLastSyncTimestamp,
  type LicenseStatus,
} from '@/utils/ownerStatsUtils';
import { setActiveSchoolScope } from '@/store/slices/schoolScopeSlice';

interface SchoolInfo {
  id: string;
  schoolName?: string;
  schoolAbbreviation?: string;
  subDistrict?: string;
  district?: string;
  province?: string;
  affiliation?: string;
  directorPrefix?: string;
  directorName?: string;
  academicHeadName?: string;
  logoUrl?: string;
  teacherCount?: number;
  studentCount?: number;
  firestoreUsage?: string;
  storageUsage?: string;
  firestoreUsageBytes?: number;
  storageUsageBytes?: number;
  firestoreDocumentCount?: number;
  schoolType?: string;
  opportunityExpansionLevel?: string;
  licenseStatus?: LicenseStatus;
  maExpiryDate?: string;
  contractExpiryDate?: string;
  lastBackupAt?: string;
  lastSyncAt?: any;
}

const LICENSE_BADGE_STYLES: Record<LicenseStatus, string> = {
  active: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  trial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  expired: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-800',
};

const LICENSE_BADGE_DOT: Record<LicenseStatus, string> = {
  active: '🟢',
  trial: '🟡',
  expired: '🔴',
};

const LicenseBadges: React.FC<{ school: SchoolInfo }> = ({ school }) => {
  if (!school.licenseStatus && !school.maExpiryDate) return null;
  const maDaysLeft = getDaysUntilMaExpiry(school.maExpiryDate);
  const expiringSoon = isMaExpiringSoon(school.maExpiryDate);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {school.licenseStatus && (
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${LICENSE_BADGE_STYLES[school.licenseStatus]}`}>
          {LICENSE_BADGE_DOT[school.licenseStatus]} {LICENSE_STATUS_LABELS[school.licenseStatus]}
        </span>
      )}
      {school.maExpiryDate && (
        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${expiringSoon ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300 border-gray-200 dark:border-gray-700'}`}>
          {expiringSoon && '🔔 '}💳 MA: {school.maExpiryDate}{maDaysLeft !== null && maDaysLeft < 0 ? ' (หมดอายุ)' : ''}
        </span>
      )}
    </div>
  );
};

const SkeletonLoader: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
    {[...Array(6)].map((_, i) => (
      <div key={i} className="bg-gray-50 dark:bg-[#1e1f21] rounded-xl p-4 shadow-lg flex flex-col border border-gray-200 dark:border-gray-700/50">
        <div className="flex justify-between items-start mb-3">
          <div className="w-16 h-16 rounded-full bg-gray-300 dark:bg-gray-700"></div>
          <div className="w-6 h-6 bg-gray-300 dark:bg-gray-700 rounded-md"></div>
        </div>
        <div className="flex-grow">
          <div className="h-5 w-3/4 bg-gray-300 dark:bg-gray-700 rounded mb-2"></div>
          <div className="h-3 w-1/2 bg-gray-300 dark:bg-gray-700 rounded mb-3"></div>
          <div className="h-4 w-full bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
        <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700/50 flex items-center gap-2">
          <div className="w-4 h-4 bg-gray-300 dark:bg-gray-700 rounded-full"></div>
          <div className="h-4 w-1/3 bg-gray-300 dark:bg-gray-700 rounded"></div>
        </div>
      </div>
    ))}
  </div>
);

const SchoolListPage: React.FC = () => {
  const dispatch = useDispatch();
  const [schools, setSchools] = useState<SchoolInfo[]>([]);
  const [stats, setStats] = useState({
    totalSchools: 0,
    totalTeachers: 0,
    totalStudents: 0,
    firestoreUsage: '0 MB',
    storageUsage: '0 GB'
  });
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshingSummary, setIsRefreshingSummary] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('schoolListViewMode') as 'grid' | 'list') || 'grid';
  });

  const collectionName = 'school-settings';

  const enterSchoolAsSuperAdmin = (school: SchoolInfo) => {
    dispatch(setActiveSchoolScope({
      schoolId: school.id,
      schoolName: school.schoolName || school.schoolAbbreviation || school.id,
    }));
    window.location.href = "/academic/hub/registration";
  };

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [ownerSummary, querySnapshot] = await Promise.all([
        fetchOwnerDashboardSummary(db),
        getDocs(collection(db, collectionName)),
      ]);

      const schoolsData = await Promise.all(querySnapshot.docs.map(async (schoolDoc) => {
        const data = schoolDoc.data() as Omit<SchoolInfo, 'id'> & Record<string, any>;
        const [summary, license] = await Promise.all([
          fetchSchoolDashboardSummary(db, schoolDoc.id, data),
          fetchSchoolLicenseInfo(db, schoolDoc.id),
        ]);
        return {
          ...data,
          id: schoolDoc.id,
          teacherCount: summary.teacherCount,
          studentCount: summary.studentCount,
          firestoreUsage: summary.firestoreUsage,
          storageUsage: summary.storageUsage,
          firestoreUsageBytes: summary.firestoreUsageBytes,
          storageUsageBytes: summary.storageUsageBytes,
          firestoreDocumentCount: summary.firestoreDocumentCount,
          licenseStatus: license?.licenseStatus,
          maExpiryDate: license?.maExpiryDate,
          contractExpiryDate: license?.contractExpiryDate,
          lastBackupAt: license?.lastBackupAt,
          lastSyncAt: data.updatedAt,
        };
      }));

      const combinedSummary = await writeOwnerDashboardSummaryFromSchools(
        db,
        schoolsData.map((school) => ({
          teacherCount: school.teacherCount || 0,
          studentCount: school.studentCount || 0,
          firestoreUsage: school.firestoreUsage || '0 MB',
          storageUsage: school.storageUsage || '0 GB',
          firestoreUsageBytes: school.firestoreUsageBytes || 0,
          storageUsageBytes: school.storageUsageBytes || 0,
          firestoreDocumentCount: school.firestoreDocumentCount || 0,
        }))
      );

      setStats({
        totalSchools: combinedSummary.totalSchools || ownerSummary?.totalSchools || schoolsData.length,
        totalTeachers: combinedSummary.totalTeachers || ownerSummary?.totalTeachers || 0,
        totalStudents: combinedSummary.totalStudents || ownerSummary?.totalStudents || 0,
        firestoreUsage: combinedSummary.firestoreUsage || ownerSummary?.firestoreUsage || '0 MB',
        storageUsage: combinedSummary.storageUsage || ownerSummary?.storageUsage || '0 GB'
      });

      setSchools(schoolsData);
    } catch (error) {
      console.error("Error fetching schools list:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถดึงรายการโรงเรียนได้', 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefreshSummary = async () => {
    setIsRefreshingSummary(true);
    try {
      const summary = await refreshOwnerDashboardSummaryFromCounts(db);
      setStats(summary);
      Swal.fire({
        icon: 'success',
        title: 'อัปเดตสรุปแล้ว',
        text: `โรงเรียน ${summary.totalSchools} | ครู ${summary.totalTeachers} | นักเรียน ${summary.totalStudents}`,
        timer: 2200,
        showConfirmButton: false,
      });
      fetchData();
    } catch (error) {
      console.error("Error refreshing owner summary:", error);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลสรุปได้', 'error');
    } finally {
      setIsRefreshingSummary(false);
    }
  };

  const handleDeleteSchool = async (schoolId: string, logoUrl?: string) => {
    const result = await Swal.fire({
      title: 'คุณแน่ใจหรือไม่?',
      text: "การลบโรงเรียนจะลบข้อมูลที่เกี่ยวข้องทั้งหมดและไม่สามารถกู้คืนได้!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'ใช่, ลบเลย!',
      cancelButtonText: 'ยกเลิก'
    });

    if (result.isConfirmed) {
      try {
        Swal.fire({
          title: 'กำลังลบ...',
          allowOutsideClick: false,
          didOpen: () => {
            Swal.showLoading();
          }
        });

        // 1. Delete all teachers and their images
        const teachersSnapshot = await getDocs(collection(db, collectionName, schoolId, 'teachers'));
        const teacherCount = teachersSnapshot.docs.filter((teacherDoc) =>
          isActiveTeacherSummaryStatus(teacherDoc.data().status || 'อยู่')
        ).length;
        for (const teacherDoc of teachersSnapshot.docs) {
          const teacherData = teacherDoc.data();
          if (teacherData.profileImageUrl) {
            try {
              await deleteObject(ref(storage, teacherData.profileImageUrl));
            } catch (e) { console.error("Error deleting teacher image:", e); }
          }
          await deleteDoc(teacherDoc.ref);
          // Note: We don't delete Auth accounts here to avoid hitting rate limits in a loop
          // and because we might not have all UIDs easily or permissions.
        }

        // 2. Delete all students and their images
        const studentsSnapshot = await getDocs(collection(db, collectionName, schoolId, 'students'));
        const studentCount = studentsSnapshot.docs.filter((studentDoc) => {
          const data = studentDoc.data();
          return isActiveStudentSummaryStatus(data.status || data.studentStatus);
        }).length;
        for (const studentDoc of studentsSnapshot.docs) {
          const studentData = studentDoc.data();
          if (studentData.profileImageUrl) {
            try {
              await deleteObject(ref(storage, studentData.profileImageUrl));
            } catch (e) { console.error("Error deleting student image:", e); }
          }
          await deleteDoc(studentDoc.ref);
        }

        // 3. Delete logo from storage if it exists
        if (logoUrl) {
          try {
            const logoRef = ref(storage, logoUrl);
            await deleteObject(logoRef);
          } catch (error) {
            console.error("Error deleting logo:", error);
          }
        }

        // 4. Delete document from Firestore
        await deleteDoc(getSchoolDashboardSummaryRef(db, schoolId));
        await deleteDoc(doc(db, collectionName, schoolId));
        await updateOwnerDashboardSummary(db, {
          schools: -1,
          teachers: -teacherCount,
          students: -studentCount,
        });

        Swal.fire('ลบสำเร็จ!', 'ข้อมูลโรงเรียนถูกลบออกแล้ว', 'success');
        fetchData(); // รีเฟรชข้อมูล
      } catch (error) {
        console.error("Error deleting school:", error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถลบข้อมูลโรงเรียนได้', 'error');
      }
    }
  };

  const filteredSchools = schools.filter(school =>
    (school.schoolName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (school.province || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (school.district || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout>
      <div className="p-2 sm:p-3 text-gray-900 dark:text-white transition-colors duration-300">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight">รายการโรงเรียน</h1>
              <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                จัดการข้อมูลโรงเรียนทั้งหมดในระบบ · 📈 เวอร์ชันระบบ {SYSTEM_VERSION}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
              <div className="relative w-full sm:w-72">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400 text-xs" />
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาโรงเรียน, จังหวัด..."
                  className="pl-8 pr-3 py-1.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-[11px] text-gray-900 dark:text-white placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {/* View Mode Toggle */}
              <div className="flex items-center bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 rounded-xl p-1 shadow-sm self-start sm:self-auto">
                <button
                  onClick={() => { setViewMode('list'); localStorage.setItem('schoolListViewMode', 'list'); }}
                  className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                  title="แสดงผลแบบรายการ (List)"
                >
                  <List size={14} />
                </button>
                <button
                  onClick={() => { setViewMode('grid'); localStorage.setItem('schoolListViewMode', 'grid'); }}
                  className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
                  title="แสดงผลแบบการ์ด (Grid)"
                >
                  <LayoutGrid size={14} />
                </button>
              </div>
              <Link
                to="/owner/school-info"
                className="flex items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white px-3 py-1.5 rounded-xl font-medium transition-all shadow-sm hover:shadow-md active:scale-95 text-[11px] whitespace-nowrap"
              >
                <FaPlus size={10} />
                <span>เพิ่มโรงเรียนใหม่</span>
              </Link>
              <button
                type="button"
                onClick={handleRefreshSummary}
                disabled={isRefreshingSummary}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-1.5 rounded-xl font-medium transition-all shadow-sm hover:shadow-md active:scale-95 text-[11px] whitespace-nowrap"
              >
                <FaServer size={10} className={isRefreshingSummary ? 'animate-spin' : ''} />
                <span>{isRefreshingSummary ? 'กำลังอัปเดต...' : 'อัปเดตสรุป'}</span>
              </button>
            </div>
          </header>

          {/* Dashboard Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <div className="bg-white dark:bg-[#2a2b2f] p-2.5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 rounded-full mb-1 text-indigo-600 dark:text-indigo-400">
                <FaSchool size={16} />
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.totalSchools}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">โรงเรียนทั้งหมด</div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-2.5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-full mb-1 text-blue-600 dark:text-blue-400">
                <FaChalkboardTeacher size={16} />
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.totalTeachers}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">ครูทั้งหมด</div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-2.5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-full mb-1 text-emerald-600 dark:text-emerald-400">
                <FaUserGraduate size={16} />
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.totalStudents}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">นักเรียนทั้งหมด</div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-2.5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded-full mb-1 text-orange-600 dark:text-orange-400">
                <FaDatabase size={16} />
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.firestoreUsage}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">Firestore Usage (Est.)</div>
            </div>
            <div className="bg-white dark:bg-[#2a2b2f] p-2.5 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 flex flex-col items-center justify-center text-center">
              <div className="p-2 bg-red-50 dark:bg-red-900/20 rounded-full mb-1 text-red-600 dark:text-red-400">
                <FaHdd size={16} />
              </div>
              <div className="text-lg font-bold text-gray-900 dark:text-white">{stats.storageUsage}</div>
              <div className="text-[9px] text-gray-500 dark:text-gray-400">Storage Usage (Est.)</div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm dark:shadow-none">
            {isLoading ? (
              <SkeletonLoader />
            ) : filteredSchools.length > 0 ? (
              viewMode === 'list' ? (
                <div className="flex flex-col gap-2">
                  {filteredSchools.map((school) => (
                    <div key={school.id} className="group relative bg-gray-50 dark:bg-[#1e1f21] rounded-xl px-3 py-2.5 border border-gray-200 dark:border-gray-700/50 hover:border-sky-500/40 hover:shadow-md transition-all duration-200 flex items-center gap-3">
                      <div className="absolute top-0 left-0 h-full w-1 bg-sky-500 rounded-l-xl opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="w-9 h-9 rounded-lg bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
                        {school.logoUrl ? (
                          <img src={school.logoUrl} alt="School Logo" className="w-full h-full object-cover" />
                        ) : (
                          <FaSchool className="text-gray-400 dark:text-gray-500 text-sm" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-3 gap-1 sm:gap-3 items-center">
                        <div className="min-w-0">
                          <Link to={`/owner/schools/${school.id}`} className="text-xs font-bold text-gray-900 dark:text-white hover:text-sky-500 dark:hover:text-sky-400 transition-colors truncate block">
                            {school.schoolName || 'ยังไม่มีชื่อ'} {school.schoolAbbreviation && `(${school.schoolAbbreviation})`}
                          </Link>
                          <p className="text-[9px] text-gray-500 dark:text-gray-400 truncate">{school.affiliation || 'ยังไม่มีสังกัด'}</p>
                          <div className="mt-1"><LicenseBadges school={school} /></div>
                        </div>
                        <div className="flex items-center gap-1 text-[9px] text-gray-500 dark:text-gray-400">
                          <FaUserTie size={9} className="flex-shrink-0" />
                          <span className="truncate">{[school.directorPrefix, school.directorName].filter(Boolean).join(' ') || '-'}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                            <FaChalkboardTeacher size={9} /> {school.teacherCount || 0}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <FaUserGraduate size={9} /> {school.studentCount || 0}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-orange-600 dark:text-orange-400">
                            <FaDatabase size={9} /> {school.firestoreUsage || '0 MB'}
                          </span>
                          <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                            <FaHdd size={9} /> {school.storageUsage || '0 GB'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => enterSchoolAsSuperAdmin(school)}
                          className="text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                          title="เข้าดูโรงเรียน"
                        >
                          <FaSchool size={11} />
                        </button>
                        <Link to={`/owner/school-info/${school.id}`} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="แก้ไข">
                          <FaEdit size={11} />
                        </Link>
                        <button onClick={() => handleDeleteSchool(school.id, school.logoUrl)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="ลบ">
                          <FaTrash size={10} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredSchools.map((school) => (
                    <div key={school.id} className="bg-gray-50 dark:bg-[#1e1f21] rounded-xl p-2.5 shadow-lg flex flex-col border border-gray-200 dark:border-gray-700/50 hover:border-sky-500/50 transition-all duration-300">
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="w-12 h-12 rounded-xl bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm flex-shrink-0">
                            {school.logoUrl ? (
                              <img src={school.logoUrl} alt="School Logo" className="w-full h-full object-cover" />
                            ) : (
                              <FaSchool className="text-gray-400 dark:text-gray-500 text-xl" />
                            )}
                          </div>
                          <div className="flex-1">
                            <Link to={`/owner/schools/${school.id}`} className="text-sm font-bold text-gray-900 dark:text-white hover:text-sky-500 dark:hover:text-sky-400 transition-colors leading-tight block" title={school.schoolName}>
                              {school.schoolName || 'ยังไม่มีชื่อโรงเรียน'} {school.schoolAbbreviation && `(${school.schoolAbbreviation})`}
                            </Link>
                            <p className="text-gray-500 dark:text-gray-400 text-[9px] mt-0.5">{school.affiliation || 'ยังไม่มีสังกัด'}</p>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {school.schoolType && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                  {school.schoolType}
                                </span>
                              )}
                              {school.opportunityExpansionLevel && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                  {school.opportunityExpansionLevel}
                                </span>
                              )}
                            </div>
                            <div className="mt-1.5"><LicenseBadges school={school} /></div>
                            <p className="text-gray-600 dark:text-gray-300 text-xs mt-2">
                              {[
                                school.subDistrict ? `ต.${school.subDistrict}` : '',
                                school.district ? `อ.${school.district}` : '',
                                school.province ? `จ.${school.province}` : '',
                              ].filter(Boolean).join(' ') || 'ไม่มีข้อมูลที่อยู่'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => enterSchoolAsSuperAdmin(school)}
                            className="text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            title="เข้าดูโรงเรียน"
                          >
                            <FaSchool size={12} />
                          </button>
                          <Link to={`/owner/school-info/${school.id}`} className="text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="แก้ไข">
                            <FaEdit size={12} />
                          </Link>
                          <button
                            onClick={() => handleDeleteSchool(school.id, school.logoUrl)}
                            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                            title="ลบ"
                          >
                            <FaTrash size={11} />
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 mb-3">
                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30">
                          <div className="p-1 rounded bg-white dark:bg-indigo-900/30 shadow-sm text-indigo-600 dark:text-indigo-400">
                            <FaChalkboardTeacher size={9} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">ครู</span>
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-none">{school.teacherCount || 0}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30">
                          <div className="p-1 rounded bg-white dark:bg-emerald-900/30 shadow-sm text-emerald-600 dark:text-emerald-400">
                            <FaUserGraduate size={9} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">นักเรียน</span>
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-none">{school.studentCount || 0}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-orange-50/50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/30">
                          <div className="p-1 rounded bg-white dark:bg-orange-900/30 shadow-sm text-orange-600 dark:text-orange-400">
                            <FaDatabase size={9} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">Data</span>
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-none">{school.firestoreUsage || '0 MB'}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-red-50/50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30">
                          <div className="p-1 rounded bg-white dark:bg-red-900/30 shadow-sm text-red-600 dark:text-red-400">
                            <FaHdd size={9} />
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 leading-none mb-0.5">Storage</span>
                            <span className="text-[10px] font-bold text-gray-700 dark:text-gray-200 leading-none">{school.storageUsage || '0 GB'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-auto pt-2 border-t border-gray-200 dark:border-gray-700/50 flex items-center gap-2">
                        <FaUserTie className="text-gray-400 dark:text-gray-500 text-xs" />
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-700 dark:text-gray-300 font-medium">{[school.directorPrefix, school.directorName].filter(Boolean).join(' ') || '-'}</span>
                          <span className="text-[9px] text-gray-500 dark:text-gray-400">ผู้อำนวยการ{school.schoolName}</span>
                        </div>
                      </div>
                      <div className="mt-1 flex flex-col gap-0.5 text-[9px] text-gray-400 dark:text-gray-500">
                        <span>❤️ ซิงค์ข้อมูลล่าสุด: {formatLastSyncTimestamp(school.lastSyncAt)}</span>
                        {school.lastBackupAt && <span>📦 Backup ล่าสุด: {school.lastBackupAt}</span>}
                        {school.contractExpiryDate && <span>📅 หมดอายุสัญญา: {school.contractExpiryDate}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="text-center py-10">
                <p className="text-gray-500 dark:text-gray-400">ยังไม่มีข้อมูลโรงเรียนในระบบ</p>
                <Link to="/owner/school-info" className="mt-4 inline-block bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg">
                  <FaPlus className="inline-block mr-2" /> เพิ่มโรงเรียนใหม่
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout >
  );
};

export default SchoolListPage;
