import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "./store";
import { useInitializeStore } from "@/hooks/useInitializeStore";
import LoadingScreen from "@/components/LoadingScreen";
import PullToRefresh from "@/components/PullToRefresh";

import ProtectedRoute from "./components/ProtectedRoute";
import ActivityModeGuard from "./components/ActivityModeGuard";
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, STUDENT_AFFAIRS_ACCESS, STUDENT_AFFAIRS_MANAGEMENT, STUDENT_SUPPORT_OPERATIONAL_ACCESS, STUDENT_ATTENDANCE_REPORT_ACCESS, CLUB_MEMBER_MANAGEMENT_ACCESS } from "@/constants/permissions";

import PublicRoute from "./components/PublicRoute";

// Import Student Pages

// Import Teacher Pages

// Import Academic Pages

// import AddDesiredCharacteristicsPage from "./pages/AcademicDepartment/AddDesiredCharacteristicsPage"; // 📌 นำออกตามคำขอ
// import AssessmentReadingThinkingWritingPage from "./pages/AcademicDepartment/AssessmentReadingThinkingWritingPage"; // 📌 นำออกตามคำขอ

import { PermissionProvider } from "@/contexts/PermissionContext";

import { lazy, Suspense, useEffect } from "react";
import { useFcmNotification } from "@/hooks/useFcmNotification";
import { ROLES } from "@/constants/roles";

const LoginPage = lazy(() => import("./pages/Auth/LoginPage"));
const RegisterPage = lazy(() => import("./pages/Auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/Auth/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/Auth/ResetPasswordPage"));
const HomePage = lazy(() => import("./pages/Home/HomePage"));
const NotificationsPage = lazy(() => import("./pages/Notifications/NotificationsPage"));
const ProfilePage = lazy(() => import("./pages/Profile/ProfilePage"));
const LeaveRequestPage = lazy(() => import("./pages/Attendance/LeaveRequestPage"));
const LeaveHistoryPage = lazy(() => import("./pages/Attendance/LeaveHistoryPage"));
const CheckinOutPage = lazy(() => import("./pages/Attendance/CheckinOutPage"));
const FlagCeremonyPage = lazy(() => import("./pages/Attendance/FlagCeremonyPage"));
const UserManagementPage = lazy(() => import("./pages/Administrator/UserManagementPage"));
const AddStudentPage = lazy(() => import("./pages/Students/AddStudentPage"));
const QuickAddStudentPage = lazy(() => import("./pages/Students/QuickAddStudentPage"));
const StudentListPage = lazy(() => import("./pages/Students/StudentListPage"));
const EditStudentPage = lazy(() => import("./pages/Students/EditStudentPage"));
const ViewStudentPage = lazy(() => import("./pages/Students/ViewStudentPage"));
const MapRfidPage = lazy(() => import("./pages/Students/MapRfidPage"));
const BehaviorScorePage = lazy(() => import("./pages/Students/BehaviorScorePage"));
const BulkUploadStudentImagesPage = lazy(() => import("./pages/Administrator/BulkUploadStudentImagesPage"));
const ImportStudentDMCPage = lazy(() => import("./pages/Administrator/ImportStudentDMCPage"));
const StudentSupportPage = lazy(() => import("./pages/StudentSupport/StudentSupportPage"));
const SDQPage = lazy(() => import("./pages/StudentSupport/SDQPage"));
const SDQStudentPage = lazy(() => import("./pages/StudentSupport/SDQStudentPage"));
const SDQTeacherPage = lazy(() => import("./pages/StudentSupport/SDQTeacherPage"));
const SDQParentPage = lazy(() => import("./pages/StudentSupport/SDQParentPage"));
const ScreeningHub = lazy(() => import("./pages/StudentSupport/Screening/ScreeningHub"));
const ScreeningTeacherPage = lazy(() => import("./pages/StudentSupport/Screening/ScreeningTeacherPage"));
const ScreeningStudentPage = lazy(() => import("./pages/StudentSupport/Screening/ScreeningStudentPage"));
const ScreeningParentPage = lazy(() => import("./pages/StudentSupport/Screening/ScreeningParentPage"));
const HomeVisitDashboard = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitDashboard"));
const NewHomeVisit = lazy(() => import("./pages/StudentSupport/HomeVisit/NewHomeVisit"));
const HomeVisitSummary = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummary"));
const HomeVisitSummaryHub = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummaryHub"));
const HomeVisitSummaryClassroom = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummaryClassroom"));
const HomeVisitSummaryAll = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummaryAll"));
const HomeVisitSummaryOBEC = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummaryOBEC"));
const HomeVisitSummaryLevelRange = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummaryLevelRange"));
const HomeVisitSummaryIndividual = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitSummaryIndividual"));
const HomeVisitTracking = lazy(() => import("./pages/StudentSupport/HomeVisit/HomeVisitTracking"));
const BehaviorScoreAnalysisPage = lazy(() => import("./pages/StudentSupport/BehaviorScoreAnalysisPage"));
const AddTeacherPage = lazy(() => import("./pages/Teachers/AddTeacherPage"));
const TeacherListPage = lazy(() => import("./pages/Teachers/TeacherListPage"));
const EditTeacherPage = lazy(() => import("./pages/Teachers/EditTeacherPage"));
const TeacherLeaveHistoryPage = lazy(() => import("./pages/Attendance/TeacherLeaveHistoryPage"));
const TeacherLeaveRequestPage = lazy(() => import("./pages/Attendance/TeacherLeaveRequestPage"));
const OfficialTravelRequestPage = lazy(() => import("./pages/Attendance/OfficialTravelRequestPage"));
const OfficialTravelHistoryPage = lazy(() => import("./pages/Attendance/OfficialTravelHistoryPage"));
const ViewTeacherPage = lazy(() => import("./pages/Teachers/ViewTeacherPage"));
const QuickAddTeacherPage = lazy(() => import("./pages/Teachers/QuickAddTeacherPage"));
const ImportTeacherPage = lazy(() => import("./pages/Teachers/ImportTeacherPage"));
const ImportStudentPage = lazy(() => import("./pages/Students/ImportStudentPage"));
const StudentAttendanceDateSelectionPage = lazy(() => import("./pages/Students/StudentAttendanceDateSelectionPage"));
const StudentBK14ReportPage = lazy(() => import("./pages/Students/StudentBK14ReportPage"));
const StudentPhotoDownloadPage = lazy(() => import("./pages/Students/StudentPhotoDownloadPage"));
const BulkUploadTeacherImagesPage = lazy(() => import("./pages/Administrator/BulkUploadTeacherImagesPage"));
const AdvisorManagementPage = lazy(() => import("./pages/Teachers/AdvisorManagementPage"));
const CourseManagementPage = lazy(() => import("./pages/AcademicDepartment/CourseManagementPage"));
const CourseEnrollmentPage = lazy(() => import("@/pages/AcademicDepartment/CourseEnrollmentPage"));
const CourseAssignmentPage = lazy(() => import("@/pages/AcademicDepartment/CourseAssignmentPage"));
const CourseAssignmentPage2 = lazy(() => import("@/pages/AcademicDepartment/CourseAssignmentPage2"));
const TeacherSchedulePage = lazy(() => import("./pages/AcademicDepartment/schedule/TeacherSchedulePage"));
const StudentSchedulePage = lazy(() => import("./pages/AcademicDepartment/StudentSchedulePage"));
const MySchedulePage = lazy(() => import("./pages/AcademicDepartment/MySchedulePage"));
const SpecialPeriodManagementPage = lazy(() => import("./pages/AcademicDepartment/SpecialPeriodManagementPage"));
const ClassroomAttendancePage = lazy(() => import("./pages/AcademicDepartment/ClassroomAttendance"));
const HomeroomAttendancePage = lazy(() => import("./pages/AcademicDepartment/HomeroomAttendancePage"));
const HomeroomStudentListPage = lazy(() => import("./pages/AcademicDepartment/HomeroomStudentListPage"));
const GuidanceAttendancePage = lazy(() => import("./pages/AcademicDepartment/GuidanceAttendancePage"));
const SpecialPeriodAttendancePage = lazy(() => import("./pages/AcademicDepartment/SpecialPeriodAttendancePage"));
const SpecialPeriodReportsPage = lazy(() => import("./pages/AcademicDepartment/SpecialPeriodReportsPage"));
const HistoricalClassroomAttendancePage = lazy(() => import("./pages/AcademicDepartment/HistoricalClassroomAttendancePage"));
const AttendanceSummaryPage = lazy(() => import("./pages/AcademicDepartment/AttendanceSummaryPage"));
const MsReportPage = lazy(() => import("./pages/AcademicDepartment/MsReportPage"));
const ClassroomAttendanceAuditPage = lazy(() => import("./pages/AcademicDepartment/ClassroomAttendanceAuditPage"));
const EscapeSummaryPage = lazy(() => import("./pages/AcademicDepartment/EscapeSummaryPage"));
const TimeRangeAttendanceSummaryPage = lazy(() => import("./pages/AcademicDepartment/TimeRangeAttendanceSummaryPage"));
const StudentBehaviorClassReportPage = lazy(() => import("./pages/AcademicDepartment/StudentBehaviorClassReportPage"));
const GradeBookPage = lazy(() => import("./pages/AcademicDepartment/GradeBookPage"));
const SchoolCalendarPage = lazy(() => import("./pages/AcademicDepartment/SchoolCalendarPage"));
const SubstituteManagementPage = lazy(() => import("./pages/AcademicDepartment/SubstituteManagementPage"));
const SubstituteReportPage = lazy(() => import("./pages/AcademicDepartment/SubstituteReportPage"));
const SubstituteSchedulePrintPage = lazy(() => import("./pages/AcademicDepartment/SubstituteSchedulePrintPage"));
const TeacherScheduleViewPage = lazy(() => import("./pages/AcademicDepartment/TeacherScheduleViewPage"));
const ViewCoursesPage = lazy(() => import("./pages/AcademicDepartment/ViewCoursesPage"));
const DocumentVerificationPage = lazy(() => import("./pages/Public/DocumentVerificationPage"));
const SlugResolverPage = lazy(() => import("./pages/Public/SlugResolverPage"));
const LineRegisterPage = lazy(() => import("./pages/Public/LineRegisterPage"));
const PeriodSettingsPage = lazy(() => import("./pages/AcademicDepartment/PeriodSettingsPage"));
const ClubAttendancePage = lazy(() => import("./pages/AcademicDepartment/ClubAttendancePage"));
const ClubManagementPage = lazy(() => import("./pages/AcademicDepartment/ClubManagementPage"));
const ClubMemberManagementPage = lazy(() => import("./pages/AcademicDepartment/ClubMemberManagementPage"));
const ClubReportsPage = lazy(() => import("./pages/AcademicDepartment/ClubReportsPage"));
const ClubListPage = lazy(() => import("./pages/AcademicDepartment/ClubListPage"));
const ClubViewPage = lazy(() => import("./pages/AcademicDepartment/ClubViewPage"));
const LearnerActivityAttendancePage = lazy(() => import("./pages/AcademicDepartment/LearnerActivityAttendancePage"));
const LearnerActivityManagementPage = lazy(() => import("./pages/AcademicDepartment/LearnerActivityManagementPage"));
const LearnerActivityStudentManagementPage = lazy(() => import("./pages/AcademicDepartment/LearnerActivityStudentManagementPage"));
const ActivityHubSettingsPage = lazy(() => import("./pages/AcademicDepartment/ActivityHubSettingsPage"));
const ActivityEvaluationPage = lazy(() => import("./pages/AcademicDepartment/ActivityEvaluationPage"));
const SchoolInfoPage = lazy(() => import("./pages/owner/SchoolInfoPage"));
const SchoolListPage = lazy(() => import("./pages/owner/SchoolListPage"));
const SchoolDetailsPage = lazy(() => import("./pages/owner/SchoolDetailsPage"));
const UserListPage = lazy(() => import("./pages/owner/UserListPage"));
const EditUserPage = lazy(() => import("./pages/owner/EditUserPage"));
const AddUserPage = lazy(() => import("./pages/owner/AddUserPage"));
const PermissionManagementPage = lazy(() => import("./pages/owner/PermissionManagementPage"));
const SchoolPermissionManagementPage = lazy(() => import("./pages/AcademicDepartment/SchoolPermissionManagementPage"));
const SchoolDataExplorerPage = lazy(() => import("./pages/owner/SchoolDataExplorerPage"));
const ImportCoursePage = lazy(() => import("./pages/AcademicDepartment/ImportCoursePage"));
const EnrollmentListPage = lazy(() => import("./pages/AcademicDepartment/EnrollmentListPage"));
const SubjectGroupManagementPage = lazy(() => import("@/pages/AcademicDepartment/SubjectGroupManagementPage"));
const ScoreConfigurationPage = lazy(() => import("./pages/AcademicDepartment/ScoreConfigurationPage"));
const FormativeScoreEntryPage = lazy(() => import("./pages/AcademicDepartment/FormativeScoreEntryPage"));
const PostMidtermScoreEntryPage = lazy(() => import("./pages/AcademicDepartment/PostMidtermScoreEntryPage"));
const AcademicSettingsPage = lazy(() => import("./pages/AcademicDepartment/AcademicSettingsPage"));
const PeriodConstraintPage = lazy(() => import("./pages/AcademicDepartment/schedule/PeriodConstraintPage"));
const GraduationManagementPage = lazy(() => import("./pages/AcademicDepartment/GraduationManagementPage"));
const GraduationPendingPage = lazy(() => import("./pages/AcademicDepartment/GraduationPendingPage"));
const AlumniManagementPage = lazy(() => import("./pages/AcademicDepartment/AlumniManagementPage"));
const RoomTransferManagementPage = lazy(() => import("./pages/AcademicDepartment/RoomTransferManagementPage"));
const GradeTransferPage = lazy(() => import("./pages/Students/GradeTransferPage"));
const PhysicalRoomsPage = lazy(() => import("./pages/AcademicDepartment/PhysicalRoomsPage"));
const PorBor7Page = lazy(() => import("./pages/AcademicDepartment/PorBor7Page"));
const HubPage = lazy(() => import("./pages/Shared/HubPage"));
const AttendanceConfigPage = lazy(() => import("./pages/HumanResources/AttendanceConfigPage"));
const BehaviorScoreConfigPage = lazy(() => import("./pages/HumanResources/BehaviorScoreConfigPage"));
const TeacherAttendanceTodayPage = lazy(() => import("./pages/HumanResources/TeacherAttendanceTodayPage"));
const TeacherAttendanceSummaryPage = lazy(() => import("./pages/HumanResources/TeacherAttendanceSummaryPage"));
const TeacherAttendanceIndividualPage = lazy(() => import("./pages/HumanResources/TeacherAttendanceIndividualPage"));
const TeacherAttendanceDateSelectionPage = lazy(() => import("./pages/HumanResources/TeacherAttendanceDateSelectionPage"));
const LeaveApprovalPage = lazy(() => import("./pages/HumanResources/LeaveApprovalPage"));
const HRTimeRegistrationPage = lazy(() => import("./pages/HumanResources/HRTimeRegistrationPage"));
const StudentsAttendanceSummaryPage = lazy(() => import("./pages/Students/StudentsAttendanceSummaryPage"));
const DailyClassroomAttendanceSummaryPage = lazy(() => import("./pages/Students/DailyClassroomAttendanceSummaryPage"));
const LineOAManagementPage = lazy(() => import("./pages/Administrator/LineOAManagementPage"));
const TelegramManagementPage = lazy(() => import("./pages/Administrator/TelegramManagementPage"));

function App() {
  const { loading, user } = useSelector((state: RootState) => state.auth);
  useFcmNotification(user?.uid);
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
    <PermissionProvider schoolId={user?.schoolId}>
    <PullToRefresh>
      <Router>
        <Suspense fallback={<LoadingScreen />}><Routes>
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
          {/* บุคลากรทุกตำแหน่ง (ครู/ผู้บริหาร/เจ้าหน้าที่ ฯลฯ) ต้องลงเวลาด้วยตนเองได้ ไม่จำกัดเฉพาะเจ้าหน้าที่ลงเวลา */}
          <Route path="/attendance/checkin-out" element={<ProtectedRoute allowedRoles={[...STAFF_ACCESS, ROLES.SUPER_ADMIN, ROLES.STUDENT_ATTENDANCE, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE]}><CheckinOutPage /></ProtectedRoute>} />
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
          <Route path="/student-support/sdq/parent" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><SDQParentPage /></ProtectedRoute>} />

          <Route path="/student-support/screening" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><ScreeningHub /></ProtectedRoute>} />
          <Route path="/student-support/screening/teacher" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><ScreeningTeacherPage /></ProtectedRoute>} />
          <Route path="/student-support/screening/student" element={<ProtectedRoute allowedRoles={[ROLES.STUDENT, ...STUDENT_SUPPORT_OPERATIONAL_ACCESS]}><ScreeningStudentPage /></ProtectedRoute>} />
          <Route path="/student-support/screening/parent" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><ScreeningParentPage /></ProtectedRoute>} />

          <Route path="/student-support/home-visit" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><HomeVisitDashboard /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/new/:studentId" element={<ProtectedRoute allowedRoles={STUDENT_SUPPORT_OPERATIONAL_ACCESS}><NewHomeVisit /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryHub /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/classroom" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryClassroom /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/all" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryAll /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/obec" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryOBEC /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/level-range" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryLevelRange /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/individual" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummaryIndividual /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/tracking" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitTracking /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary/legacy" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><HomeVisitSummary /></ProtectedRoute>} />
          <Route path="/student-support/behavior-analysis" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><BehaviorScoreAnalysisPage /></ProtectedRoute>} />

          {/* Student Management */}
          <Route path="/school/:schoolId/students" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><StudentListPage /></ProtectedRoute>} />
          {/* ครูผู้สอนทุกคนต้องเข้าถึงเมนูคะแนนพฤติกรรมได้ ไม่จำกัดเฉพาะฝ่ายกิจการนักเรียน */}
          <Route path="/school/:schoolId/students/behavior" element={<ProtectedRoute allowedRoles={[...STUDENT_AFFAIRS_ACCESS, ROLES.TEACHER]}><BehaviorScorePage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/add" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><AddStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/quick-add" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><QuickAddStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/edit/:studentId" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><EditStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/view/:studentId" element={<ProtectedRoute allowedRoles={[...STAFF_ACCESS, ROLES.STUDENT]}><ViewStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/map-rfid/:type" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><MapRfidPage /></ProtectedRoute>} />

          {/* Teacher Management */}
          <Route path="/school/:schoolId/teachers" element={<ProtectedRoute allowedRoles={[...ADMIN_ACCESS, ...ACADEMIC_ACCESS]}><TeacherListPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/edit/:teacherId" element={<ProtectedRoute allowedRoles={[...ADMIN_ACCESS, ...STAFF_ACCESS]}><EditTeacherPage /></ProtectedRoute>} />
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
          <Route path="/academic/substitute-report" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><SubstituteReportPage /></ProtectedRoute>} />
          <Route path="/academic/substitute-schedule-print" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><SubstituteSchedulePrintPage /></ProtectedRoute>} />
          <Route path="/academic/period-constraints" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PeriodConstraintPage /></ProtectedRoute>} />
          <Route path="/academic/period-settings" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PeriodSettingsPage /></ProtectedRoute>} />
          <Route path="/academic/import-courses" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ImportCoursePage /></ProtectedRoute>} />
          <Route path="/academic/settings" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><AcademicSettingsPage /></ProtectedRoute>} />
           <Route path="/academic/attendance-config" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><AttendanceConfigPage /></ProtectedRoute>} />
          <Route path="/academic/behavior-score-config" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_MANAGEMENT}><BehaviorScoreConfigPage /></ProtectedRoute>} />
          <Route path="/academic/settings/line-oa" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><LineOAManagementPage /></ProtectedRoute>} />
          <Route path="/academic/settings/telegram" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><TelegramManagementPage /></ProtectedRoute>} />
          <Route path="/academic/permission-management" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><SchoolPermissionManagementPage /></ProtectedRoute>} />
          <Route path="/academic/personnel-time-registration" element={<ProtectedRoute allowedRoles={[ROLES.SCHOOL_ADMIN, ROLES.TEACHER_ATTENDANCE, ROLES.SCHOOL_ATTENDANCE]}><HRTimeRegistrationPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-today" element={<ProtectedRoute allowedRoles={TEACHER_ATTENDANCE_TODAY_ACCESS}><TeacherAttendanceTodayPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-date-selection" element={<ProtectedRoute allowedRoles={[ROLES.SCHOOL_ADMIN]}><TeacherAttendanceDateSelectionPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><TeacherAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/teacher-attendance-individual" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><TeacherAttendanceIndividualPage /></ProtectedRoute>} />
          <Route path="/academic/student-attendance-date-selection" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentAttendanceDateSelectionPage /></ProtectedRoute>} />
          <Route path="/academic/student-bk14-report" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentBK14ReportPage /></ProtectedRoute>} />
          <Route path="/academic/students-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><StudentsAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/daily-classroom-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_AFFAIRS_ACCESS}><DailyClassroomAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/student-photo-download" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><StudentPhotoDownloadPage /></ProtectedRoute>} />

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
          <Route path="/academic/learner-activities" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ActivityModeGuard><LearnerActivityManagementPage /></ActivityModeGuard></ProtectedRoute>} />
          <Route path="/academic/activity-settings" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ActivityHubSettingsPage /></ProtectedRoute>} />
          <Route path="/academic/learner-activity-students" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ActivityModeGuard><LearnerActivityStudentManagementPage /></ActivityModeGuard></ProtectedRoute>} />
          <Route path="/academic/flag-ceremony" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><FlagCeremonyPage /></ProtectedRoute>} />
          <Route path="/academic/homeroom-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><HomeroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/guidance-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><GuidanceAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/special-period-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><SpecialPeriodAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/special-period-reports" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><SpecialPeriodReportsPage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ClassroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-history" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><HistoricalClassroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-summary" element={<ProtectedRoute allowedRoles={STUDENT_ATTENDANCE_REPORT_ACCESS}><AttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/ms-report" element={<ProtectedRoute allowedRoles={STUDENT_ATTENDANCE_REPORT_ACCESS}><MsReportPage /></ProtectedRoute>} />
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
          <Route path="/owner/schools/:schoolId/data" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><SchoolDataExplorerPage /></ProtectedRoute>} />
          <Route path="/owner/users" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ...ADMIN_ACCESS]}><UserListPage /></ProtectedRoute>} />
          <Route path="/owner/users/edit/:userId" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ...ADMIN_ACCESS]}><EditUserPage /></ProtectedRoute>} />
          <Route path="/owner/users/add" element={<ProtectedRoute allowedRoles={[ROLES.SUPER_ADMIN, ...ADMIN_ACCESS]}><AddUserPage /></ProtectedRoute>} />
          <Route path="/owner/permission-management" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><PermissionManagementPage /></ProtectedRoute>} />

          {/* Slug Resolver (Multi-tenancy) */}
          <Route path="/:slug" element={<SlugResolverPage />} />

          {/* Default fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes></Suspense>
      </Router>
    </PullToRefresh>
    </PermissionProvider>
  );
}

export default App;
