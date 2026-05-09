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
import ProfilePage from "./pages/Profile/ProfilePage";
import LeaveRequestPage from "./pages/Attendance/LeaveRequestPage"; // 📌 เพิ่มการ import หน้าใบลากิจ/ลาป่วย
import LeaveHistoryPage from "./pages/Attendance/LeaveHistoryPage"; // 📌 เพิ่มการ import หน้าประวัติการลา
import CheckinOutPage from "./pages/Attendance/CheckinOutPage"; // 📌 เพิ่มการ import หน้าลงเวลาเข้า-ออก
import FlagCeremonyPage from "./pages/Attendance/FlagCeremonyPage"; // 📌 เพิ่มการ import หน้ากิจกรรมหน้าเสาธง
import ProtectedRoute from "./components/ProtectedRoute";
import { OWNER_ONLY, ADMIN_ACCESS, ACADEMIC_ACCESS, STAFF_ACCESS, ACADEMIC_MANAGEMENT, TEACHER_OPERATIONAL, ATTENDANCE_SCANNER_ACCESS } from "@/constants/permissions";


import UserManagementPage from "./pages/Administrator/UserManagementPage";
import LineOAManagementPage from "./pages/Administrator/LineOAManagementPage";
import TelegramManagementPage from "./pages/Administrator/TelegramManagementPage";

import PublicRoute from "./components/PublicRoute";



// Import Student Pages
import AddStudentPage from "./pages/Students/AddStudentPage";
import QuickAddStudentPage from "./pages/Students/QuickAddStudentPage";
import StudentListPage from "./pages/Students/StudentListPage"; 
import EditStudentPage from "./pages/Students/EditStudentPage"; 
import ViewStudentPage from "./pages/Students/ViewStudentPage"; 

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
import BulkUploadTeacherImagesPage from "./pages/Administrator/BulkUploadTeacherImagesPage";

// Import Academic Pages
import AcademicAdminPage from "./pages/AcademicDepartment/AcademicAdminPage";
import CourseManagementPage from "./pages/AcademicDepartment/CourseManagementPage";
import CourseEnrollmentPage from "@/pages/AcademicDepartment/CourseEnrollmentPage"; // 📌 เพิ่มการ import หน้าลงทะเบียนรายวิชา
import CourseAssignmentPage from "@/pages/AcademicDepartment/CourseAssignmentPage"; // 📌 เพิ่มการ import หน้าลงทะเบียนครูและสถานที่
import TeacherSchedulePage from "./pages/AcademicDepartment/schedule/TeacherSchedulePage"; // กลับไปใช้ไฟล์ UI เดิมตามคำขอของผู้ใช้
import StudentSchedulePage from "./pages/AcademicDepartment/StudentSchedulePage"; // 📌 เพิ่มการ import หน้าใหม่
import SpecialPeriodManagementPage from "./pages/AcademicDepartment/SpecialPeriodManagementPage"; // 📌 เพิ่มการ import หน้าจัดการคาบเรียนพิเศษ
import ClassroomAttendancePage from "./pages/AcademicDepartment/ClassroomAttendance"; // 📌 เปลี่ยนพาธให้ชี้ที่โฟลเดอร์ใหม่ที่มี index.tsx
import HistoricalClassroomAttendancePage from "./pages/AcademicDepartment/HistoricalClassroomAttendancePage"; // 📌 เพิ่มการ import หน้าเช็คชื่อย้อนหลัง
import AttendanceSummaryPage from "./pages/AcademicDepartment/AttendanceSummaryPage"; // 📌 เพิ่มการสรุปการมาเรียน
import GradeBookPage from "./pages/AcademicDepartment/GradeBookPage";
import FormativeScorePage from "./pages/AcademicDepartment/FormativeScorePage";
import SchoolCalendarPage from "./pages/AcademicDepartment/SchoolCalendarPage"; // 📌 เพิ่มการ import หน้าใหม่
import SubstituteManagementPage from "./pages/AcademicDepartment/SubstituteManagementPage"; // 📌 เพิ่มการ import หน้าใหม่
import TeacherScheduleViewPage from "./pages/AcademicDepartment/TeacherScheduleViewPage"; // 📌 เพิ่มการ import หน้าใหม่
import ViewCoursesPage from "./pages/AcademicDepartment/ViewCoursesPage"; // 📌 เพิ่มการ import หน้าดูหลักสูตร
// import AddDesiredCharacteristicsPage from "./pages/AcademicDepartment/AddDesiredCharacteristicsPage"; // 📌 นำออกตามคำขอ
// import AssessmentReadingThinkingWritingPage from "./pages/AcademicDepartment/AssessmentReadingThinkingWritingPage"; // 📌 นำออกตามคำขอ
import DocumentVerificationPage from "./pages/Public/DocumentVerificationPage"; // 📌 เพิ่มหน้าตรวจสอบเอกสาร
import SlugResolverPage from "./pages/Public/SlugResolverPage"; // 📌 เพิ่มหน้าจัดการ Slug

import PeriodSettingsPage from "./pages/AcademicDepartment/PeriodSettingsPage"; // 📌 เพิ่มการ import หน้าตั้งค่าคาบเรียน


import ClubAttendancePage from "./pages/AcademicDepartment/ClubAttendancePage"; // 📌 เพิ่มการ import หน้าเช็คชื่อชุมนุม

import ClubManagementPage from "./pages/AcademicDepartment/ClubManagementPage"; // 📌 เพิ่มการ import หน้าจัดการชุมนุม
import ClubMemberManagementPage from "./pages/AcademicDepartment/ClubMemberManagementPage"; // 📌 เพิ่มการ import หน้าจัดการสมาชิกชุมนุม
import SchoolInfoPage from "./pages/owner/SchoolInfoPage";
import SchoolListPage from "./pages/owner/SchoolListPage";
import SchoolDetailsPage from "./pages/owner/SchoolDetailsPage"; // New page
import UserListPage from "./pages/owner/UserListPage";
import EditUserPage from "./pages/owner/EditUserPage";
import AddUserPage from "./pages/owner/AddUserPage";

import ImportCoursePage from "./pages/AcademicDepartment/ImportCoursePage"; // 📌 เพิ่มการ import หน้านำเข้าหลักสูตรจาก Excel
import EnrollmentListPage from "./pages/AcademicDepartment/EnrollmentListPage"; // 📌 เพิ่มการสรุปการลงทะเบียน
import SubjectGroupManagementPage from "@/pages/AcademicDepartment/SubjectGroupManagementPage"; // 📌 เพิ่มการ import หน้าจัดการกลุ่มสาระและตัวชี้วัด
import ScoreConfigurationPage from "./pages/AcademicDepartment/ScoreConfigurationPage"; // 📌 เพิ่มการ import หน้าตั้งค่าคะแนนเต็มรายวิชา
import FormativeScoreEntryPage from "./pages/AcademicDepartment/FormativeScoreEntryPage"; // 📌 เพิ่มหน้าบันทึกคะแนนก่อนกลางภาค
import PostMidtermScoreEntryPage from "./pages/AcademicDepartment/PostMidtermScoreEntryPage"; // 📌 เพิ่มหน้าบันทึกคะแนนหลังกลางภาค
import AcademicSettingsPage from "./pages/AcademicDepartment/AcademicSettingsPage"; // 📌 เพิ่มการ import หน้าตั้งค่าระบบวิชาการ
import PeriodConstraintPage from "./pages/AcademicDepartment/schedule/PeriodConstraintPage";
import GraduationManagementPage from "./pages/AcademicDepartment/GraduationManagementPage";
import RoomTransferManagementPage from "./pages/AcademicDepartment/RoomTransferManagementPage";
import PhysicalRoomsPage from "./pages/AcademicDepartment/PhysicalRoomsPage";
import HubPage from "./pages/Shared/HubPage"; // 📌 เพิ่มหน้า Hub กลาง

// Import Human Resources Pages
import HumanResourcePage from "./pages/HumanResources/HumanResourcePage";
import AttendanceConfigPage from "./pages/HumanResources/AttendanceConfigPage";
import IdCardPage from "./pages/HumanResources/IdCardPage";
import TeacherAttendanceSummaryPage from "./pages/HumanResources/TeacherAttendanceSummaryPage";
import TeacherAttendanceTodayPage from "./pages/HumanResources/TeacherAttendanceTodayPage";
import StudentsAttendanceSummaryPage from "./pages/Students/StudentsAttendanceSummaryPage";


import { ROLES } from "@/constants/roles";

function App() {
  const { loading } = useSelector((state: RootState) => state.auth);

  // 🔥 Auto-fetch ทุก Redux Slice ครั้งเดียวหลัง login
  useInitializeStore();

  if (loading) {
    return <LoadingScreen />;
  }

  // Permission groups are imported from @/constants/permissions

  return (
    <PullToRefresh>
      <Router>
        <Routes>
          {/* Public Pages */}
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/register" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><RegisterPage /></ProtectedRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPasswordPage /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
          <Route path="/verify-doc" element={<DocumentVerificationPage />} />

          {/* Protected Pages - General */}
          <Route path="/home" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          {/* Attendance & Leave (Staff Only) */}
          <Route path="/attendance/leave-request" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><LeaveRequestPage /></ProtectedRoute>} />
          <Route path="/attendance/teacher-leave-request" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><TeacherLeaveRequestPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/official-travel-request" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><OfficialTravelRequestPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/official-travel-history" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><OfficialTravelHistoryPage /></ProtectedRoute>} />
          <Route path="/attendance/leave-history" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><LeaveHistoryPage /></ProtectedRoute>} />
          <Route path="/attendance/teacher-leave-history" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><TeacherLeaveHistoryPage /></ProtectedRoute>} />
          <Route path="/attendance/checkin-out" element={<ProtectedRoute allowedRoles={ATTENDANCE_SCANNER_ACCESS}><CheckinOutPage /></ProtectedRoute>} />
          <Route path="/attendance/flag-ceremony" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><FlagCeremonyPage /></ProtectedRoute>} />

          {/* Administrator Pages */}
          <Route path="/administrator/user-management" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS} featureFlag="personnel"><UserManagementPage /></ProtectedRoute>} />
          <Route path="/administrator/line-oa" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><LineOAManagementPage /></ProtectedRoute>} />
          <Route path="/administrator/telegram" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><TelegramManagementPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/bulk-upload" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><BulkUploadStudentImagesPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/import-dmc" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><ImportStudentDMCPage /></ProtectedRoute>} />

          {/* Student Support System Pages (Staff Access) */}
          <Route path="/student-support" element={<ProtectedRoute allowedRoles={STAFF_ACCESS} featureFlag="studentAffairs"><StudentSupportPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><SDQPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq/student" element={<ProtectedRoute allowedRoles={[ROLES.STUDENT, ...STAFF_ACCESS]}><SDQStudentPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq/teacher" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><SDQTeacherPage /></ProtectedRoute>} />
          <Route path="/student-support/sdq/parent" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><SDQParentPage /></ProtectedRoute>} />

          <Route path="/student-support/screening" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ScreeningHub /></ProtectedRoute>} />
          <Route path="/student-support/screening/teacher" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ScreeningTeacherPage /></ProtectedRoute>} />
          <Route path="/student-support/screening/student" element={<ProtectedRoute allowedRoles={[ROLES.STUDENT, ...STAFF_ACCESS]}><ScreeningStudentPage /></ProtectedRoute>} />
          <Route path="/student-support/screening/parent" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ScreeningParentPage /></ProtectedRoute>} />

          <Route path="/student-support/home-visit" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><HomeVisitDashboard /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/new/:studentId" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><NewHomeVisit /></ProtectedRoute>} />
          <Route path="/student-support/home-visit/summary" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><HomeVisitSummary /></ProtectedRoute>} />

          {/* Student Management */}
          <Route path="/school/:schoolId/students" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><StudentListPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/add" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><AddStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/quick-add" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><QuickAddStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/edit/:studentId" element={<ProtectedRoute allowedRoles={ACADEMIC_ACCESS}><EditStudentPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/students/view/:studentId" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ViewStudentPage /></ProtectedRoute>} />

          {/* Teacher Management */}
          <Route path="/school/:schoolId/teachers" element={<ProtectedRoute allowedRoles={[...ADMIN_ACCESS, ...ACADEMIC_ACCESS]}><TeacherListPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/edit/:teacherId" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><EditTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/view/:teacherId" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><ViewTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/add" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><AddTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/quick-add" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><QuickAddTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/import" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><ImportTeacherPage /></ProtectedRoute>} />
          <Route path="/school/:schoolId/teachers/bulk-upload-images" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><BulkUploadTeacherImagesPage /></ProtectedRoute>} />

          {/* Academic Hub Routes */}
          <Route path="/academic/hub/:hubType" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><HubPage /></ProtectedRoute>} />
          <Route path="/student-support/hub" element={<ProtectedRoute allowedRoles={STAFF_ACCESS}><HubPage /></ProtectedRoute>} />
          
          {/* Academic Department (Academic Admin Access) */}
          <Route path="/school/:schoolId/academic" element={<ProtectedRoute allowedRoles={STAFF_ACCESS} featureFlag="academic"><HubPage /></ProtectedRoute>} />
          <Route path="/academic-admin" element={<ProtectedRoute allowedRoles={STAFF_ACCESS} featureFlag="academic"><HubPage /></ProtectedRoute>} />
          <Route path="/academic/course-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseManagementPage /></ProtectedRoute>} />
          <Route path="/academic/course-enrollment" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseEnrollmentPage /></ProtectedRoute>} />
          <Route path="/academic/course-assignment" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><CourseAssignmentPage /></ProtectedRoute>} />
          <Route path="/academic/score-configuration" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ScoreConfigurationPage /></ProtectedRoute>} />
          <Route path="/academic/formative-scores" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><FormativeScoreEntryPage /></ProtectedRoute>} />
          <Route path="/academic/post-midterm-scores" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><PostMidtermScoreEntryPage /></ProtectedRoute>} />
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
          <Route path="/academic/graduation-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><GraduationManagementPage /></ProtectedRoute>} />
          <Route path="/academic/room-transfer" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><RoomTransferManagementPage /></ProtectedRoute>} />
          <Route path="/academic/physical-rooms" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><PhysicalRoomsPage /></ProtectedRoute>} />

          {/* Daily Classroom (Staff Access) */}
          <Route path="/academic/club-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ClubAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/club-management" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ClubManagementPage /></ProtectedRoute>} />
          <Route path="/academic/club-members" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><ClubMemberManagementPage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><ClassroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-history" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><HistoricalClassroomAttendancePage /></ProtectedRoute>} />
          <Route path="/academic/classroom-attendance-summary" element={<ProtectedRoute allowedRoles={ACADEMIC_MANAGEMENT}><AttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/academic/student-schedule" element={<ProtectedRoute allowedRoles={[...TEACHER_OPERATIONAL, ROLES.STUDENT]}><StudentSchedulePage /></ProtectedRoute>} />
          <Route path="/academic/teacher-schedule-view" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><TeacherScheduleViewPage /></ProtectedRoute>} />
          <Route path="/academic/grade-book" element={<ProtectedRoute allowedRoles={TEACHER_OPERATIONAL}><GradeBookPage /></ProtectedRoute>} />

          {/* Human Resources Pages */}
          <Route path="/human-resources/hub" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><HubPage /></ProtectedRoute>} />
          <Route path="/human-resources/management" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><HumanResourcePage /></ProtectedRoute>} />
          <Route path="/human-resources/teacher-attendance-today" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><TeacherAttendanceTodayPage /></ProtectedRoute>} />
          <Route path="/human-resources/teacher-attendance-summary" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><TeacherAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/human-resources/id-card" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><IdCardPage /></ProtectedRoute>} />
          <Route path="/human-resources/students-attendance-summary" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><StudentsAttendanceSummaryPage /></ProtectedRoute>} />
          <Route path="/human-resources/attendance-config" element={<ProtectedRoute allowedRoles={ADMIN_ACCESS}><AttendanceConfigPage /></ProtectedRoute>} />

          {/* Owner Pages (Super Admin & School Admin) */}
          <Route path="/owner/hub" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><HubPage /></ProtectedRoute>} />
          <Route path="/owner/school-info/:schoolId?" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><SchoolInfoPage /></ProtectedRoute>} />
          <Route path="/owner/schools" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><SchoolListPage /></ProtectedRoute>} />
          <Route path="/owner/schools/:schoolId" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><SchoolDetailsPage /></ProtectedRoute>} />
          <Route path="/owner/users" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><UserListPage /></ProtectedRoute>} />
          <Route path="/owner/users/edit/:userId" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><EditUserPage /></ProtectedRoute>} />
          <Route path="/owner/users/add" element={<ProtectedRoute allowedRoles={OWNER_ONLY}><AddUserPage /></ProtectedRoute>} />

          {/* Slug Resolver (Multi-tenancy) */}
          <Route path="/:slug" element={<SlugResolverPage />} />

          {/* Default fallback */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Router>
    </PullToRefresh>
  );
}

export default App;
