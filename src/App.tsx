import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "./store";
import { useInitializeStore } from "@/hooks/useInitializeStore";
import LoadingScreen from "@/components/LoadingScreen";
import PullToRefresh from "@/components/PullToRefresh";
import LoginPage from "./pages/Auth/LoginPage";
import RegisterPage from "./pages/Auth/RegisterPage";
import ForgotPasswordPage from "./pages/Auth/ForgotPasswordPage";
import ResetPasswordPage from "./pages/Auth/ResetPasswordPage";
import HomePage from "./pages/Home/HomePage";
import NotificationsPage from "./pages/Notifications/NotificationsPage";
import ProfilePage from "./pages/Profile/ProfilePage";
import LeaveRequestPage from "./pages/Attendance/LeaveRequestPage"; // 📌 เพิ่มการ import หน้าใบลากิจ/ลาป่วย
import LeaveHistoryPage from "./pages/Attendance/LeaveHistoryPage"; // 📌 เพิ่มการ import หน้าประวัติการลา
import CheckinOutPage from "./pages/Attendance/CheckinOutPage";
import FlagCeremonyPage from "./pages/Attendance/FlagCeremonyPage"; // 📌 เพิ่มการ import หน้าเช็คชื่อกิจกรรมเข้าแถว
import ProtectedRoute from "./components/ProtectedRoute";
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, STUDENT_AFFAIRS_ACCESS, STUDENT_AFFAIRS_MANAGEMENT, STUDENT_SUPPORT_OPERATIONAL_ACCESS, STUDENT_ATTENDANCE_REPORT_ACCESS, CLUB_MEMBER_MANAGEMENT_ACCESS } from "@/constants/permissions";


import UserManagementPage from "./pages/Administrator/UserManagementPage";

import PublicRoute from "./components/PublicRoute";



// Import Student Pages
import AddStudentPage from "./pages/Students/AddStudentPage";
import QuickAddStudentPage from "./pages/Students/QuickAddStudentPage";
import StudentListPage from "./pages/Students/StudentListPage"; 
import EditStudentPage from "./pages/Students/EditStudentPage"; 
import ViewStudentPage from "./pages/Students/ViewStudentPage"; 
import MapRfidPage from "./pages/Students/MapRfidPage"; // 📌 เพิ่มการ import หน้าลงทะเบียนบัตร RFID
import BehaviorScorePage from "./pages/Students/BehaviorScorePage";


import BulkUploadStudentImagesPage from "./pages/Administrator/BulkUploadStudentImagesPage"; // 📌 หน้าอัปโหลดรูปนักเรียนจำนวนมาก
import ImportStudentDMCPage from "./pages/Administrator/ImportStudentDMCPage"; // 📌 หน้า Import DMC

import StudentSupportPage from "./pages/StudentSupport/StudentSupportPage";
import SDQPage from "./pages/StudentSupport/SDQPage"; // 📌 เพิ่มหน้า SDQ
import SDQStudentPage from "./pages/StudentSupport/SDQStudentPage";
import SDQTeacherPage from "./pages/StudentSupport/SDQTeacherPage";
import SDQParentPage from "./pages/StudentSupport/SDQParentPage";
import ScreeningHub from "./pages/StudentSupport/Screening/ScreeningHub";
import ScreeningTeacherPage from "./pages/StudentSupport/Screening/ScreeningTeacherPage";
import ScreeningStudentPage from "./pages/StudentSupport/Screening/ScreeningStudentPage";
import ScreeningParentPage from "./pages/StudentSupport/Screening/ScreeningParentPage";
import HomeVisitDashboard from "./pages/StudentSupport/HomeVisit/HomeVisitDashboard";
import NewHomeVisit from "./pages/StudentSupport/HomeVisit/NewHomeVisit";
import HomeVisitSummary from "./pages/StudentSupport/HomeVisit/HomeVisitSummary";
import HomeVisitSummaryHub from "./pages/StudentSupport/HomeVisit/HomeVisitSummaryHub";
import HomeVisitSummaryClassroom from "./pages/StudentSupport/HomeVisit/HomeVisitSummaryClassroom";
import HomeVisitSummaryAll from "./pages/StudentSupport/HomeVisit/HomeVisitSummaryAll";
import HomeVisitSummaryOBEC from "./pages/StudentSupport/HomeVisit/HomeVisitSummaryOBEC";
import HomeVisitTracking from "./pages/StudentSupport/HomeVisit/HomeVisitTracking";
// Import Teacher Pages
import AddTeacherPage from "./pages/Teachers/AddTeacherPage";
import TeacherListPage from "./pages/Teachers/TeacherListPage";
import EditTeacherPage from "./pages/Teachers/EditTeacherPage"; // เพิ่มการ import
import TeacherLeaveHistoryPage from "./pages/Attendance/TeacherLeaveHistoryPage"; // 📌 เพิ่มการ import
import TeacherLeaveRequestPage from "./pages/Attendance/TeacherLeaveRequestPage"; // 📌 เพิ่มการ import หน้าใบลากิจ/ลาป่วยของครู
import OfficialTravelRequestPage from "./pages/Attendance/OfficialTravelRequestPage";
import OfficialTravelHistoryPage from "./pages/Attendance/OfficialTravelHistoryPage"; // 📌 เพิ่มการ import หน้าขอไปราชการ
import ViewTeacherPage from "./pages/Teachers/ViewTeacherPage";
import QuickAddTeacherPage from "./pages/Teachers/QuickAddTeacherPage";
import ImportTeacherPage from "./pages/Teachers/ImportTeacherPage";
import ImportStudentPage from "./pages/Students/ImportStudentPage";
import StudentAttendanceDateSelectionPage from "./pages/Students/StudentAttendanceDateSelectionPage";
import StudentBK14ReportPage from "./pages/Students/StudentBK14ReportPage";
import BulkUploadTeacherImagesPage from "./pages/Administrator/BulkUploadTeacherImagesPage";
import AdvisorManagementPage from "./pages/Teachers/AdvisorManagementPage";

// Import Academic Pages
import AcademicAdminPage from "./pages/AcademicDepartment/AcademicAdminPage";
import CourseManagementPage from "./pages/AcademicDepartment/CourseManagementPage";
import CourseEnrollmentPage from "@/pages/AcademicDepartment/CourseEnrollmentPage"; // 📌 เพิ่มการ import หน้าลงทะเบียนรายวิชา
import CourseAssignmentPage from "@/pages/AcademicDepartment/CourseAssignmentPage"; // 📌 เพิ่มการ import หน้าลงทะเบียนครูและสถานที่
import CourseAssignmentPage2 from "@/pages/AcademicDepartment/CourseAssignmentPage2"; // 📌 เพิ่มการ import หน้ามอบหมายรายวิชา 2 (แบบตาราง)
import TeacherSchedulePage from "./pages/AcademicDepartment/schedule/TeacherSchedulePage"; // กลับไปใช้ไฟล์ UI เดิมตามคำขอของผู้ใช้
import StudentSchedulePage from "./pages/AcademicDepartment/StudentSchedulePage"; // 📌 เพิ่มการ import หน้าใหม่
import MySchedulePage from "./pages/AcademicDepartment/MySchedulePage";
import SpecialPeriodManagementPage from "./pages/AcademicDepartment/SpecialPeriodManagementPage"; // 📌 เพิ่มการ import หน้าจัดการคาบเรียนพิเศษ
import ClassroomAttendancePage from "./pages/AcademicDepartment/ClassroomAttendance"; // 📌 เปลี่ยนพาธให้ชี้ที่โฟลเดอร์ใหม่ที่มี index.tsx
import HomeroomAttendancePage from "./pages/AcademicDepartment/HomeroomAttendancePage";
import HomeroomStudentListPage from "./pages/AcademicDepartment/HomeroomStudentListPage";
import GuidanceAttendancePage from "./pages/AcademicDepartment/GuidanceAttendancePage";
import HistoricalClassroomAttendancePage from "./pages/AcademicDepartment/HistoricalClassroomAttendancePage"; // 📌 เพิ่มการ import หน้าเช็คชื่อย้อนหลัง
import AttendanceSummaryPage from "./pages/AcademicDepartment/AttendanceSummaryPage"; // 📌 เพิ่มการสรุปการมาเรียน
import ClassroomAttendanceAuditPage from "./pages/AcademicDepartment/ClassroomAttendanceAuditPage"; // 📌 เพิ่มหน้าตรวจสอบการเช็คชื่อของครู
import EscapeSummaryPage from "./pages/AcademicDepartment/EscapeSummaryPage";
import TimeRangeAttendanceSummaryPage from "./pages/AcademicDepartment/TimeRangeAttendanceSummaryPage";
import StudentBehaviorClassReportPage from "./pages/AcademicDepartment/StudentBehaviorClassReportPage";
import GradeBookPage from "./pages/AcademicDepartment/GradeBookPage";
import SchoolCalendarPage from "./pages/AcademicDepartment/SchoolCalendarPage"; // 📌 เพิ่มการ import หน้าใหม่
import SubstituteManagementPage from "./pages/AcademicDepartment/SubstituteManagementPage"; // 📌 เพิ่มการ import หน้าใหม่
import TeacherScheduleViewPage from "./pages/AcademicDepartment/TeacherScheduleViewPage"; // 📌 เพิ่มการ import หน้าใหม่
import ViewCoursesPage from "./pages/AcademicDepartment/ViewCoursesPage"; // 📌 เพิ่มการ import หน้าดูหลักสูตร
// import AddDesiredCharacteristicsPage from "./pages/AcademicDepartment/AddDesiredCharacteristicsPage"; // 📌 นำออกตามคำขอ
// import AssessmentReadingThinkingWritingPage from "./pages/AcademicDepartment/AssessmentReadingThinkingWritingPage"; // 📌 นำออกตามคำขอ
import DocumentVerificationPage from "./pages/Public/DocumentVerificationPage"; // 📌 เพิ่มหน้าตรวจสอบเอกสาร
import SlugResolverPage from "./pages/Public/SlugResolverPage"; // 📌 เพิ่มหน้าจัดการ Slug
import LineRegisterPage from "./pages/Public/LineRegisterPage"; // 📌 เพิ่มหน้าลงทะเบียน LINE


import PeriodSettingsPage from "./pages/AcademicDepartment/PeriodSettingsPage"; // 📌 เพิ่มการ import หน้าตั้งค่าคาบเรียน


import ClubAttendancePage from "./pages/AcademicDepartment/ClubAttendancePage"; // 📌 เพิ่มการ import หน้าเช็คชื่อชุมนุม

import ClubManagementPage from "./pages/AcademicDepartment/ClubManagementPage"; // 📌 เพิ่มการ import หน้าจัดการชุมนุม
import ClubMemberManagementPage from "./pages/AcademicDepartment/ClubMemberManagementPage"; // 📌 เพิ่มการ import หน้าจัดการสมาชิกชุมนุม
import ClubReportsPage from "./pages/AcademicDepartment/ClubReportsPage"; // 📌 เพิ่มการ import หน้าสรุปรายงานชุมนุม
import ClubListPage from "./pages/AcademicDepartment/ClubListPage"; // 📌 เพิ่มการ import หน้าทำเนียบชุมนุมทั้งหมด
import ClubViewPage from "./pages/AcademicDepartment/ClubViewPage"; // 📌 เพิ่มการ import หน้าดูข้อมูลชุมนุมรายตัว
import LearnerActivityAttendancePage from "./pages/AcademicDepartment/LearnerActivityAttendancePage";
import LearnerActivityManagementPage from "./pages/AcademicDepartment/LearnerActivityManagementPage";
import LearnerActivityStudentManagementPage from "./pages/AcademicDepartment/LearnerActivityStudentManagementPage";
import ActivityEvaluationPage from "./pages/AcademicDepartment/ActivityEvaluationPage";
import SchoolInfoPage from "./pages/owner/SchoolInfoPage";
import SchoolListPage from "./pages/owner/SchoolListPage";
import SchoolDetailsPage from "./pages/owner/SchoolDetailsPage"; // New page
import UserListPage from "./pages/owner/UserListPage";
import EditUserPage from "./pages/owner/EditUserPage";
import AddUserPage from "./pages/owner/AddUserPage";
import PermissionManagementPage from "./pages/owner/PermissionManagementPage";
import { PermissionProvider } from "@/contexts/PermissionContext";

import ImportCoursePage from "./pages/AcademicDepartment/ImportCoursePage"; // 📌 เพิ่มการ import หน้านำเข้าหลักสูตรจาก Excel
import EnrollmentListPage from "./pages/AcademicDepartment/EnrollmentListPage"; // 📌 เพิ่มการสรุปการลงทะเบียน
import SubjectGroupManagementPage from "@/pages/AcademicDepartment/SubjectGroupManagementPage"; // 📌 เพิ่มการ import หน้าจัดการกลุ่มสาระและตัวชี้วัด
import ScoreConfigurationPage from "./pages/AcademicDepartment/ScoreConfigurationPage"; // 📌 เพิ่มการ import หน้าตั้งค่าคะแนนเต็มรายวิชา
import FormativeScoreEntryPage from "./pages/AcademicDepartment/FormativeScoreEntryPage"; // 📌 เพิ่มหน้าบันทึกคะแนนก่อนกลางภาค
import PostMidtermScoreEntryPage from "./pages/AcademicDepartment/PostMidtermScoreEntryPage"; // 📌 เพิ่มหน้าบันทึกคะแนนหลังกลางภาค
import AcademicSettingsPage from "./pages/AcademicDepartment/AcademicSettingsPage"; // 📌 เพิ่มการ import หน้าตั้งค่าระบบวิชาการ
import PeriodConstraintPage from "./pages/AcademicDepartment/schedule/PeriodConstraintPage";
import GraduationManagementPage from "./pages/AcademicDepartment/GraduationManagementPage";
import GraduationPendingPage from "./pages/AcademicDepartment/GraduationPendingPage";
import AlumniManagementPage from "./pages/AcademicDepartment/AlumniManagementPage";
import RoomTransferManagementPage from "./pages/AcademicDepartment/RoomTransferManagementPage";
import GradeTransferPage from "./pages/Students/GradeTransferPage";
import PhysicalRoomsPage from "./pages/AcademicDepartment/PhysicalRoomsPage";
import PorBor7Page from "./pages/AcademicDepartment/PorBor7Page";
import HubPage from "./pages/Shared/HubPage"; // 📌 เพิ่มหน้า Hub กลาง
import AttendanceConfigPage from "./pages/HumanResources/AttendanceConfigPage"; // 📌 เพิ่มการ import หน้าตั้งค่าเวลาลงเวลา
import BehaviorScoreConfigPage from "./pages/HumanResources/BehaviorScoreConfigPage"; // 📌 เพิ่มการ import หน้าตั้งค่าคะแนนพฤติกรรม
import TeacherAttendanceTodayPage from "./pages/HumanResources/TeacherAttendanceTodayPage";
import TeacherAttendanceSummaryPage from "./pages/HumanResources/TeacherAttendanceSummaryPage";
import TeacherAttendanceIndividualPage from "./pages/HumanResources/TeacherAttendanceIndividualPage";
import TeacherAttendanceDateSelectionPage from "./pages/HumanResources/TeacherAttendanceDateSelectionPage";
import LeaveApprovalPage from "./pages/HumanResources/LeaveApprovalPage";
import HRTimeRegistrationPage from "./pages/HumanResources/HRTimeRegistrationPage";
import StudentsAttendanceSummaryPage from "./pages/Students/StudentsAttendanceSummaryPage";
import LineOAManagementPage from "./pages/Administrator/LineOAManagementPage";
import TelegramManagementPage from "./pages/Administrator/TelegramManagementPage";




import { useEffect } from "react";
import { ROLES } from "@/constants/roles";

function App() {
  const { loading } = useSelector((state: RootState) => state.auth);
  const TEACHER_LEAVE_HISTORY_ACCESS = [...STAFF_ACCESS, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE];
  const TEACHER_ATTENDANCE_TODAY_ACCESS = [ROLES.SCHOOL_ADMIN, ...STAFF_ACCESS, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE];
  const HUB_ACCESS = [...STAFF_ACCESS, ROLES.STUDENT_ATTENDANCE, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE];

  // ⚡ PWA Auto-Updater & Periodic SW Check (Perfect for 24/7 Kiosks & Tablets)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      // 1. Listen for new service worker taking control -> reload page automatically
      const handleControllerChange = () => {
        console.log("🚀 PWA: New service worker active! Reloading to apply update...");
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

      // 2. Perform periodic update checks (every 1 hour) to ensure 24/7 kiosks get updates
      const checkUpdate = () => {
        navigator.serviceWorker.ready.then((registration) => {
          registration.update().catch((err) => {
            console.warn("PWA: Update check failed:", err);
          });
        });
      };

      // Check on initial load
      checkUpdate();

      // Check periodically
      const intervalId = setInterval(checkUpdate, 3600_000); // 1 hour

      return () => {
        navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
        clearInterval(intervalId);
      };
    }
  }, []);

  // 🔥 Auto-fetch ทุก Redux Slice ครั้งเดียวหลัง login
  useInitializeStore();

  if (loading) {
    return <LoadingScreen />;
  }

  // Permission groups are imported from @/constants/permissions

  return (
    <PermissionProvider>
    <PullToRefresh>
      <Router>
        <Routes>
          {/* Public Pages */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><RegisterPage /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
          <Route path="/verify-doc" element={<DocumentVerificationPage />} />
          <Route path="/line/register-parent" element={<LineRegisterPage />} />

          {/* Protected Pages - General */}
          <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/my-schedule" element={<ProtectedRoute allowedRoles={[...STAFF_ACCESS, ROLES.STUDENT]}><MySchedulePage /></ProtectedRoute>} />

          {/* Attendance & Leave (Staff Only) */}
          <Route path="/attendance/leave-request" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><LeaveRequestPage /></ProtectedRoute>} />
          <Route path="/attendance/checkin-out" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN, ROLES.STUDENT_ATTENDANCE, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE]}><CheckinOutPage /></ProtectedRoute>} />
          <Route path="/attendance/teacher-leave-request" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><TeacherLeaveRequestPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/official-travel-request" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><OfficialTravelRequestPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/official-travel-history" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><OfficialTravelHistoryPage /></ProtectedRoute>} />
          <Route path="/attendance/leave-history" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><LeaveHistoryPage /></ProtectedRoute>} />
          <Route path="/attendance/teacher-leave-history" element={<ProtectedRoute allowedRoles={TEACHER_LEAVE_HISTORY_ACCESS}><TeacherLeaveHistoryPage /></ProtectedRoute>} />
          <Route path="/attendance/leave-approval" element={<ProtectedRoute allowedRoles={[ROLES.SCHOOL_ADMIN, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE]}><LeaveApprovalPage /></ProtectedRoute>} />

          {/* Administrator Pages */}
          <Route path="/administrator/user-management" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS} featureFlag="personnel"><UserManagementPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/bulk-upload" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><BulkUploadStudentImagesPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/import-dmc" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><ImportStudentDMCPage /></ProtectedRoute>} />

          {/* Student Support System Pages (Staff Access) */}
          <Route path="/student-support" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><StudentSupportPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><SDQPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq/student" element={<ProtectedRoute allowedRoles={[ROLES.STUDENT, ...STUDENT_SUPPORT_OPERATIONAL_ACCESS]}><SDQStudentPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq/teacher" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><SDQTeacherPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq/parent" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><SDQParentPage /></ProtectedRoute>} />

          <Route path="/student-support/screening" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><ScreeningHub /></ProtectedRoute>} />
          <Route path="/student-support/screening/teacher" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><ScreeningTeacherPage /></ProtectedRoute>} />
          <Route path="/student-support/screening/student" element={<ProtectedRoute allowedRoles={[ROLES.STUDENT, ...STUDENT_SUPPORT_OPERATIONAL_ACCESS]}><ScreeningStudentPage /></ProtectedRoute>} />
          <Route path="/student-support/screening/parent" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><ScreeningParentPage /></ProtectedRoute>} />

          <Route path="/student-support/home-visit" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><HomeVisitDashboard /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/new/:studentId" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><NewHomeVisit /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryHub /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/classroom" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryClassroom /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/all" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryAll /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/obec" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryOBEC /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/tracking" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitTracking /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/legacy" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummary /></ProtectedRoute>} />

          {/* Student Management */}
          <Route path="/school/:schoolId/students" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><StudentListPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/behavior" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><BehaviorScorePage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/add" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><AddStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/quick-add" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><QuickAddStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/edit/:studentId" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><EditStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/view/:studentId" element={<ProtectedRoute allowedRoles={[...STAFF_ACCESS, ROLES.STUDENT]}><ViewStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/map-rfid/:type" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><MapRfidPage /></ProtectedRoute>} />

          {/* Teacher Management */}
          <Route path="/school/:schoolId/teachers" element={<ProtectedRoute allowedRoles={[...ADMIN_ACCESS, ...ACADEMIC_ACCESS]}><TeacherListPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/edit/:teacherId" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><EditTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/view/:teacherId" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ViewTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/add" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><AddTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/quick-add" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><QuickAddTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/import" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><ImportTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/import" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><ImportStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/bulk-upload-images" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><BulkUploadTeacherImagesPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/advisor-management" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><AdvisorManagementPage /></ProtectedRoute>} />

          {/* Academic Hub Routes */}
          <Route path="/academic/hub/:hubType" element={<ProtectedRoute allowedRoles={HUB_ACCESS}><HubPage /></ProtectedRoute>} />
          <Route path="/student-support/hub" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><HubPage /></ProtectedRoute>} />
          
          {/* Academic Department (Academic Admin Access) */}
          <Route path="/school/:schoolId/academic" element={<ProtectedRoute allowedRoles={STAFF_ACCESS} featureFlag="academic"><HubPage /></ProtectedRoute>} />
          <Route path="/academic-admin" element={<ProtectedRoute allowedRoles={STAFF_ACCESS} featureFlag="academic"><HubPage /></ProtectedRoute>} />
          <Route path="/academic/course-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseManagementPage /></ProtectedRoute>} />
          <Route path="/academic/course-enrollment" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseEnrollmentPage /></ProtectedRoute>} />
          <Route path="/academic/course-assignment" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseAssignmentPage /></ProtectedRoute>} />
          <Route path="/academic/course-assignment-2" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseAssignmentPage2 /></ProtectedRoute>} />
          <Route path="/academic/score-configuration" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ScoreConfigurationPage /></ProtectedRoute>} />
          <Route path="/academic/formative-scores" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><FormativeScoreEntryPage /></ProtectedRoute>} />
          <Route path="/academic/post-midterm-scores" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><PostMidtermScoreEntryPage /></ProtectedRoute>} />
          <Route path="/academic/evaluation/learner-activities" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ActivityEvaluationPage mode="learner" /></ProtectedRoute>} />
          <Route path="/academic/evaluation/clubs" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ActivityEvaluationPage mode="club" /></ProtectedRoute>} />
          <Route path="/academic/evaluation/guidance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ActivityEvaluationPage mode="guidance" /></ProtectedRoute>} />
          <Route path="/academic/enrollment-list" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><EnrollmentListPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/academic/course-enrollment" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseEnrollmentPage /></ProtectedRoute>} />
          <Route path="/academic/view-courses" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ViewCoursesPage /></ProtectedRoute>} />
{/* <Route path="/academic/desired-characteristics" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><AddDesiredCharacteristicsPage /></ProtectedRoute>} /> */}
{/* <Route path="/academic/reading-thinking-writing" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><AssessmentReadingThinkingWritingPage /></ProtectedRoute>} /> */}
          <Route path="/academic/special-periods" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><SpecialPeriodManagementPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-schedule" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><TeacherSchedulePage /></ProtectedRoute>} />
          <Route path="/academic/subject-groups" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><SubjectGroupManagementPage /></ProtectedRoute>} />
          <Route path="/academic/school-calendar" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><SchoolCalendarPage /></ProtectedRoute>} />
          <Route path="/academic/substitute-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><SubstituteManagementPage /></ProtectedRoute>} />
          <Route path="/academic/period-constraints" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PeriodConstraintPage /></ProtectedRoute>} />
          <Route path="/academic/period-settings" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PeriodSettingsPage /></ProtectedRoute>} />
          <Route path="/academic/import-courses" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ImportCoursePage /></ProtectedRoute>} />
          <Route path="/academic/settings" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><AcademicSettingsPage /></ProtectedRoute>} />
           <Route path="/academic/attendance-config" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><AttendanceConfigPage /></ProtectedRoute>} />
          <Route path="/academic/behavior-score-config" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_MANAGEMENT}><BehaviorScoreConfigPage /></ProtectedRoute>} />
          <Route path="/academic/settings/line-oa" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><LineOAManagementPage /></ProtectedRoute>} />
          <Route path="/academic/settings/telegram" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><TelegramManagementPage /></ProtectedRoute>} />
          <Route path="/academic/personnel-time-registration" element={<ProtectedRoute allowedRoles={[ROLES.SCHOOL_ADMIN, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE]}><HRTimeRegistrationPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-today" element={<ProtectedRoute allowedRoles={TEACHER_ATTENDANCE_TODAY_ACCESS}><TeacherAttendanceTodayPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-date-selection" element={<ProtectedRoute allowedRoles={[ROLES.SCHOOL_ADMIN]}><TeacherAttendanceDateSelectionPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><TeacherAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-individual" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><TeacherAttendanceIndividualPage /></ProtectedRoute>} />
          <Route path="/academic/student-attendance-date-selection" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentAttendanceDateSelectionPage /></ProtectedRoute>} />
          <Route path="/academic/student-bk14-report" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentBK14ReportPage /></ProtectedRoute>} />
          <Route path="/academic/students-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentsAttendanceSummaryPage /></ProtectedRoute>} />

          <Route path="/academic/graduation-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><GraduationManagementPage /></ProtectedRoute>} />
          <Route path="/academic/graduation-pending" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><GraduationPendingPage /></ProtectedRoute>} />
          <Route path="/academic/alumni-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><AlumniManagementPage /></ProtectedRoute>} />
          <Route path="/academic/room-transfer" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><RoomTransferManagementPage /></ProtectedRoute>} />
          <Route path="/academic/grade-transfer" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><GradeTransferPage /></ProtectedRoute>} />
          <Route path="/academic/physical-rooms" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PhysicalRoomsPage /></ProtectedRoute>} />
          <Route path="/academic/porbor-7" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PorBor7Page /></ProtectedRoute>} />

          {/* Daily Classroom (Staff Access) */}
          <Route path="/academic/club-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ClubAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/club-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ClubManagementPage /></ProtectedRoute>} />
          <Route path="/academic/club-members" element={<ProtectedRoute allowedRoles={CLUB_MEMBER_MANAGEMENT_ACCESS}><ClubMemberManagementPage /></ProtectedRoute>} />
          <Route path="/academic/club-reports" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ClubReportsPage /></ProtectedRoute>} />
          <Route path="/academic/club-reports/:reportType" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ClubReportsPage /></ProtectedRoute>} />
          <Route path="/academic/club-list" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ClubListPage /></ProtectedRoute>} />
          <Route path="/academic/club-list/:clubId" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ClubViewPage /></ProtectedRoute>} />
          <Route path="/academic/learner-activity-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><LearnerActivityAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/learner-activities" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><LearnerActivityManagementPage /></ProtectedRoute>} />
          <Route path="/academic/learner-activity-students" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><LearnerActivityStudentManagementPage /></ProtectedRoute>} />
          <Route path="/academic/flag-ceremony" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><FlagCeremonyPage /></ProtectedRoute>} />
          <Route path="/academic/homeroom-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><HomeroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/guidance-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><GuidanceAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ClassroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-history" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><HistoricalClassroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_ATTENDANCE_REPORT_ACCESS}><AttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-audit" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ClassroomAttendanceAuditPage /></ProtectedRoute>} />
          <Route path="/academic/escape-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><EscapeSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/time-range-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><TimeRangeAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/homeroom-student-list" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><HomeroomStudentListPage /></ProtectedRoute>} />
          <Route path="/academic/student-behavior-class-report" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentBehaviorClassReportPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/academic/student-behavior-class-report" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentBehaviorClassReportPage /></ProtectedRoute>} />
          <Route path="/academic/student-schedule" element={<ProtectedRoute allowedRoles={[...TEACHER_OPERATIONAL, ROLES.STUDENT]}><StudentSchedulePage /></ProtectedRoute>} />
          <Route path="/academic/teacher-schedule-view" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><TeacherScheduleViewPage /></ProtectedRoute>} />
          <Route path="/academic/my-schedule" element={<ProtectedRoute allowedRoles={[...STAFF_ACCESS, ROLES.STUDENT]}><MySchedulePage /></ProtectedRoute>} />
          <Route path="/academic/grade-book" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><GradeBookPage /></ProtectedRoute>} />

          {/* Owner Pages (Super Admin & School Admin) */}
          <Route path="/owner/hub" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><HubPage /></ProtectedRoute>} />
          <Route path="/owner/school-info/:schoolId?" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ROLES.SCHOOL_ADMIN]}><SchoolInfoPage /></ProtectedRoute>} />
          <Route path="/owner/schools" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><SchoolListPage /></ProtectedRoute>} />
          <Route path="/owner/schools/:schoolId" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><SchoolDetailsPage /></ProtectedRoute>} />
          <Route path="/owner/users" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ...ADMIN_ACCESS]}><UserListPage /></ProtectedRoute>} />
          <Route path="/owner/users/edit/:userId" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ...ADMIN_ACCESS]}><EditUserPage /></ProtectedRoute>} />
          <Route path="/owner/users/add" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ...ADMIN_ACCESS]}><AddUserPage /></ProtectedRoute>} />
          <Route path="/owner/permission-management" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><PermissionManagementPage /></ProtectedRoute>} />

          {/* Slug Resolver (Multi-tenancy) */}
          <Route path="/:slug" element={<SlugResolverPage />} />

          {/* Default fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </PullToRefresh>
    </PermissionProvider>
  );
}

export default App;
