import React, { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link } from "react-router-dom";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import {
  collection,
  getDocs,
  doc,
  documentId,
  query,
  where,
  Timestamp,
  writeBatch,
  increment,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { Check, X, Search, Calendar, User, Clock, Clipboard, FileText, CheckCircle, XCircle } from "lucide-react";
import Swal from "sweetalert2";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { updatePeriodSummaries } from "@/utils/periodSummaryUtils";
import { getThaiYear } from "@/utils/dateUtils";

interface BaseRequest {
  id: string;
  docNo?: string;
  createdAt: Timestamp;
  status: "approved" | "rejected" | "pending" | "substitution_assigned";
  schoolId: string;
  academicYear?: string;
  reason: string;
  requiresSubstitute?: boolean;
  docPath: string; // Keep path to perform updates
  approvedBy?: string;
  approvedAt?: Timestamp;
}

interface LeaveRequest extends BaseRequest {
  teacherId?: string;
  teacherDocId: string;
  teacherName: string;
  leaveType: string;
  startDate: Timestamp;
  endDate: Timestamp;
  returnDate?: Timestamp;
}

interface TravelRequest extends BaseRequest {
  requesterId: string;
  requesterType: "teacher" | "student";
  requesterName: string;
  position: string;
  department: string;
  subject: string;
  to: string;
  location: string;
  startDate: Timestamp;
  endDate: Timestamp;
  coAdventurers?: { name: string; position: string; id: string; type?: "student" | "teacher" }[];
}

const LeaveApprovalPage: React.FC = () => {
  const { user } = useSelector((state: RootState) => state.auth);
  const schoolId = user?.schoolId;
  const [isDarkMode, setIsDarkMode] = useState(document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDarkMode(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const [activeTab, setActiveTab] = useState<"leave" | "travel">("leave");
  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Map<string, any>>(new Map());

  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [travelRequests, setTravelRequests] = useState<TravelRequest[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<Record<string, any>>({});

  // 1. Fetch teachers to map details (like department and avatar)
  const fetchTeachers = async () => {
    if (!schoolId) return;
    try {
      const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
      const teachersSnap = await getDocs(teachersRef);
      const teacherMap = new Map();
      teachersSnap.forEach((doc) => {
        teacherMap.set(doc.id, doc.data());
      });
      setTeachers(teacherMap);
    } catch (err) {
      console.error("Error fetching teachers:", err);
    }
  };

  // 2. Fetch requests (leaves & travels)
  const fetchRequests = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      // Query inside the current school scope to stay compatible with Firestore rules.
      const teachersSnap = await getDocs(collection(firestore, "school-settings", schoolId, "teachers"));
      const teacherRequestSnapshots = await Promise.all(
        teachersSnap.docs.map(async (teacherDoc) => {
          const teacherBasePath = ["school-settings", schoolId, "teachers", teacherDoc.id] as const;
          const [leaveSnap, travelSnap] = await Promise.all([
            getDocs(collection(firestore, ...teacherBasePath, "leave_summary")),
            getDocs(collection(firestore, ...teacherBasePath, "travel_summary")),
          ]);

          return { teacherDocId: teacherDoc.id, leaveSnap, travelSnap };
        })
      );

      const leaves: LeaveRequest[] = [];
      const travels: TravelRequest[] = [];

      teacherRequestSnapshots.forEach(({ teacherDocId, leaveSnap, travelSnap }) => {
        leaveSnap.forEach((requestDoc) => {
          leaves.push({
            id: requestDoc.id,
            docPath: requestDoc.ref.path,
            teacherDocId,
            ...requestDoc.data(),
          } as LeaveRequest);
        });

        travelSnap.forEach((requestDoc) => {
          travels.push({
            id: requestDoc.id,
            docPath: requestDoc.ref.path,
            ...requestDoc.data(),
          } as TravelRequest);
        });
      });

      leaves.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());
      travels.sort((a, b) => b.startDate.toMillis() - a.startDate.toMillis());

      setLeaveRequests(leaves);
      setTravelRequests(travels);
    } catch (err) {
      console.error("Error fetching requests:", err);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: "ไม่สามารถโหลดข้อมูลคำขออนุมัติได้",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
    } finally {
      setLoading(false);
    }
  };

  // 3. Listen to School Calendar (For checking holidays)
  useEffect(() => {
    if (!schoolId) return;

    fetchTeachers();
    fetchRequests();

    const docRef = doc(firestore, "school-settings", schoolId, "main_calendar", "default");
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.events) {
          setCalendarEvents(data.events);
        }
      }
    });

    return () => unsubscribe();
  }, [schoolId]);

  const checkIsHoliday = (dateStr: string) => {
    if (!dateStr) return { isHoliday: false, description: "" };
    const event = calendarEvents[dateStr];
    const d = new Date(dateStr);
    const dayOfWeek = d.getUTCDay();

    // Check weekend
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      if (event?.type === "schoolDay") return { isHoliday: false, description: event.description || "วันเรียนชดเชย" };
      if (event?.type === "holiday") return { isHoliday: true, description: event.description || "วันหยุดราชการ" };
      if (event?.type === "specialHoliday") return { isHoliday: true, description: event.description || "วันหยุดกรณีพิเศษ" };
      return { isHoliday: true, description: "วันหยุดเสาร์-อาทิตย์" };
    }

    // Check calendar events for weekdays
    if (event) {
      if (event.type === "holiday") return { isHoliday: true, description: event.description || "วันหยุดราชการ" };
      if (event.type === "specialHoliday") return { isHoliday: true, description: event.description || "วันหยุดกรณีพิเศษ" };
      if (event.type === "schoolDay") return { isHoliday: false, description: event.description || "วันเรียนชดเชย/กิจกรรม" };
    }

    return { isHoliday: false, description: "" };
  };

  // 4. Leave Approval Action Handler
  const handleApproveLeave = async (r: LeaveRequest) => {
    const result = await Swal.fire({
      title: "ยืนยันการอนุมัติคำขอลา?",
      text: `คุณกำลังอนุมัติใบลาประเภท ${r.leaveType} ของ ${r.teacherName}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#374151",
      confirmButtonText: "อนุมัติ",
      cancelButtonText: "ยกเลิก",
      background: isDarkMode ? "#2a2b2f" : "#fff",
      color: isDarkMode ? "#ffffff" : "#111827",
    });

    if (!result.isConfirmed) return;

    try {
      const batch = writeBatch(firestore);
      const requestDocRef = doc(firestore, r.docPath);

      // Set Request Status to Approved
      const newStatus = r.status === "substitution_assigned" ? "substitution_assigned" : "approved";
      batch.update(requestDocRef, {
        status: newStatus,
        approvedBy: user?.fullName || "ฝ่ายบุคคล",
        approvedAt: serverTimestamp(),
      });

      // Write daily attendance, summaries, stats
      const sDate = r.startDate.toDate();
      const eDate = r.endDate.toDate();
      const loopDate = new Date(sDate);
      let leaveDaysCount = 0;

      // Pre-fetch teacher attendance to check existing status before decrementing absent
      // ใช้ toISOString (UTC) ให้ตรงกับหน้ารายงาน (TeacherAttendanceIndividualPage) เสมอ
      // ไม่ใช้ toLocaleDateString เพราะขึ้นกับ timezone ของเครื่องที่กดอนุมัติ อาจทำให้วันที่เพี้ยนไม่ตรงกับที่รายงานอ่าน
      const teacherStartStr = sDate.toISOString().split("T")[0];
      const teacherEndStr = eDate.toISOString().split("T")[0];
      const existingTeacherAttSnap = await getDocs(
        query(
          collection(firestore, "school-settings", schoolId!, "teachers", r.teacherDocId, "attendance"),
          where(documentId(), ">=", teacherStartStr),
          where(documentId(), "<=", teacherEndStr)
        )
      );
      const teacherAttStatus = new Map<string, string>();
      existingTeacherAttSnap.forEach(d => teacherAttStatus.set(d.id, d.data().status || ""));

      while (loopDate <= eDate) {
        const dateStr = loopDate.toISOString().split("T")[0];
        const { isHoliday } = checkIsHoliday(dateStr);

        if (isHoliday) {
          loopDate.setDate(loopDate.getDate() + 1);
          continue;
        }

        leaveDaysCount++;
        loopDate.setDate(loopDate.getDate() + 1);

        // Write attendance record
        const attendanceRef = doc(
          firestore,
          "school-settings",
          schoolId!,
          "teachers",
          r.teacherDocId,
          "attendance",
          dateStr
        );
        batch.set(
          attendanceRef,
          {
            status: "ล", // 'ล' หมายถึง ลา
            checkinTime: null,
            checkoutTime: null,
            leaveRequestId: r.id,
            leaveType: r.leaveType,
            note: r.leaveType,
          },
          { merge: true }
        );

        // Daily Summary
        const wasTeacherAbsent = teacherAttStatus.get(dateStr) === 'ขาด' || teacherAttStatus.get(dateStr) === 'Absent';
        const summaryRef = doc(firestore, "school-settings", schoolId!, "summaries", "attendance", "days", dateStr);
        batch.set(summaryRef, {
          teacherStats: {
            ...(wasTeacherAbsent && { absent: increment(-1) }),
            leave: increment(1),
          },
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // Update Period Summaries
        updatePeriodSummaries(
          firestore,
          batch,
          schoolId!,
          r.teacherDocId,
          "teachers",
          dateStr,
          wasTeacherAbsent ? "absent" : null,
          "leave",
          undefined,
          r.academicYear
        );
      }

      // Update Aggregation Stats on Teacher's Profile
      if (leaveDaysCount > 0) {
        const teacherRef = doc(firestore, "school-settings", schoolId!, "teachers", r.teacherDocId);
        batch.set(teacherRef, {
          attendanceStats: {
            leave: increment(leaveDaysCount),
          },
        }, { merge: true });
      }

      await batch.commit();

      Swal.fire({
        icon: "success",
        title: "อนุมัติสำเร็จ",
        text: "คำขอได้รับการอนุมัติ และบันทึกประวัติการลาเรียบร้อยแล้ว",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });

      fetchRequests();
    } catch (err: any) {
      console.error("Error approving leave:", err);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: err.message || "ไม่สามารถดำเนินการอนุมัติได้",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
    }
  };

  // 5. Travel Approval Action Handler
  const handleApproveTravel = async (r: TravelRequest) => {
    const result = await Swal.fire({
      title: "ยืนยันการอนุมัติใบไปราชการ?",
      text: `คุณกำลังอนุมัติใบไปราชการเรื่อง: ${r.subject} ของ ${r.requesterName}`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#10b981",
      cancelButtonColor: "#374151",
      confirmButtonText: "อนุมัติ",
      cancelButtonText: "ยกเลิก",
      background: isDarkMode ? "#2a2b2f" : "#fff",
      color: isDarkMode ? "#ffffff" : "#111827",
    });

    if (!result.isConfirmed) return;

    try {
      const batch = writeBatch(firestore);
      const requestDocRef = doc(firestore, r.docPath);

      // Set Request Status to Approved
      const newStatus = r.status === "substitution_assigned" ? "substitution_assigned" : "approved";
      batch.update(requestDocRef, {
        status: newStatus,
        approvedBy: user?.fullName || "ฝ่ายบุคคล",
        approvedAt: serverTimestamp(),
      });

      const start = new Date(r.startDate.toDate());
      const end = new Date(r.endDate.toDate());

      // Pre-fetch existing attendance for all participants to avoid incorrect absent decrements
      const travelStartStr = start.toISOString().split("T")[0];
      const travelEndStr = end.toISOString().split("T")[0];

      const preFetchAttendance = async (userType: 'teachers' | 'students', userId: string): Promise<Map<string, string>> => {
        const snap = await getDocs(
          query(
            collection(firestore, "school-settings", schoolId!, userType, userId, "attendance"),
            where(documentId(), ">=", travelStartStr),
            where(documentId(), "<=", travelEndStr)
          )
        );
        const map = new Map<string, string>();
        snap.forEach(d => map.set(d.id, d.data().status || ""));
        return map;
      };

      const travelAttStatus = new Map<string, Map<string, string>>();
      if (r.requesterType === "teacher") {
        travelAttStatus.set(`teachers_${r.requesterId}`, await preFetchAttendance("teachers", r.requesterId));
      }
      if (r.coAdventurers?.length) {
        await Promise.all(r.coAdventurers.map(async adv => {
          const userType = adv.type === "student" ? "students" : "teachers";
          travelAttStatus.set(`${userType}_${adv.id}`, await preFetchAttendance(userType, adv.id));
        }));
      }

      const wasAbsentForTravel = (userType: 'teachers' | 'students', userId: string, dateStr: string) => {
        const status = travelAttStatus.get(`${userType}_${userId}`)?.get(dateStr) || "";
        return status === 'ขาด' || status === 'Absent';
      };

      // Write attendance, summaries, period summaries for requester & co-adventurers
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];

        // 1. Requester attendance (assumed to be teacher here based on scope)
        if (r.requesterType === "teacher") {
          const attRef = doc(firestore, "school-settings", schoolId!, "teachers", r.requesterId, "attendance", dateStr);
          batch.set(attRef, {
            date: dateStr,
            status: "official_travel",
            checkInTime: "08:00",
            checkOutTime: "16:30",
            note: "ไปราชการ: " + r.reason,
            timestamp: Timestamp.now(),
          }, { merge: true });

          // Teacher school-wide stats
          const requesterWasAbsent = wasAbsentForTravel("teachers", r.requesterId, dateStr);
          const oldSummaryRef = doc(firestore, "school-settings", schoolId!, "summaries", "attendance", "days", dateStr);
          batch.set(oldSummaryRef, {
            ...(requesterWasAbsent && { [`teacherStats.absent`]: increment(-1) }),
            [`teacherStats.officialTravel`]: increment(1),
            updatedAt: serverTimestamp(),
          }, { merge: true });

          updatePeriodSummaries(
            firestore,
            batch,
            schoolId!,
            r.requesterId,
            "teachers",
            dateStr,
            requesterWasAbsent ? "absent" : null,
            "officialTravel",
            undefined,
            r.academicYear
          );

          // Co-adventurers
          if (r.coAdventurers) {
            for (const adv of r.coAdventurers) {
              if (adv.type === "teacher") {
                const advAttRef = doc(firestore, "school-settings", schoolId!, "teachers", adv.id, "attendance", dateStr);
                batch.set(advAttRef, {
                  date: dateStr,
                  status: "official_travel",
                  checkInTime: "08:00",
                  checkOutTime: "16:30",
                  note: `ไปราชการ (ผู้ร่วมเดินทาง): ${r.reason}`,
                  timestamp: Timestamp.now(),
                }, { merge: true });

                const advTeacherWasAbsent = wasAbsentForTravel("teachers", adv.id, dateStr);
                updatePeriodSummaries(
                  firestore,
                  batch,
                  schoolId!,
                  adv.id,
                  "teachers",
                  dateStr,
                  advTeacherWasAbsent ? "absent" : null,
                  "officialTravel",
                  undefined,
                  r.academicYear
                );
              } else if (adv.type === "student") {
                const advClassMatch = adv.position.match(/ชั้น\s+([^/]+)/);
                const advCls = advClassMatch ? advClassMatch[1].trim() : "ไม่ระบุชั้น";

                const advAttRef = doc(firestore, "school-settings", schoolId!, "students", adv.id, "attendance", dateStr);
                batch.set(advAttRef, {
                  date: dateStr,
                  status: "official_travel",
                  checkInTime: "08:00",
                  checkOutTime: "16:30",
                  note: `ไปราชการ (ผู้ร่วมเดินทาง): ${r.reason}`,
                  timestamp: Timestamp.now(),
                }, { merge: true });

                // Student school-wide stats
                const advStudentWasAbsent = wasAbsentForTravel("students", adv.id, dateStr);
                const summaryRef = doc(firestore, "school-settings", schoolId!, "students", "Attendance", "daysummary", dateStr);
                batch.set(summaryRef, {
                  ...(advStudentWasAbsent && { absent: increment(-1), [`classes.${advCls}.absent`]: increment(-1) }),
                  officialTravel: increment(1),
                  [`classes.${advCls}.officialTravel`]: increment(1),
                  updatedAt: serverTimestamp(),
                }, { merge: true });

                updatePeriodSummaries(
                  firestore,
                  batch,
                  schoolId!,
                  adv.id,
                  "students",
                  dateStr,
                  advStudentWasAbsent ? "absent" : null,
                  "officialTravel",
                  advCls,
                  r.academicYear
                );
              }
            }
          }
        }
      }

      // Requester Profile Stats Update
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

      const requesterRef = doc(firestore, "school-settings", schoolId!, "teachers", r.requesterId);
      batch.set(requesterRef, {
        attendanceStats: {
          official_travel_days: increment(diffDays),
          present: increment(diffDays),
        },
      }, { merge: true });

      // Co-adventurer Teachers Profile Stats Update
      if (r.coAdventurers) {
        for (const adv of r.coAdventurers) {
          if (adv.type === "teacher") {
            const advRef = doc(firestore, "school-settings", schoolId!, "teachers", adv.id);
            batch.set(advRef, {
              attendanceStats: {
                official_travel_days: increment(diffDays),
                present: increment(diffDays),
              },
            }, { merge: true });
          } else if (adv.type === "student") {
            // Auto-create Student Leaves
            const leaveRef = doc(collection(firestore, "school-settings", schoolId!, "students", adv.id, "leave_summary"));
            batch.set(leaveRef, {
              leaveType: "ไปราชการ/กิจกรรม",
              reason: "ไปราชการ: " + r.reason,
              startDate: Timestamp.fromDate(new Date(r.startDate.toDate())),
              endDate: Timestamp.fromDate(new Date(r.endDate.toDate())),
              status: "approved",
              approvedBy: r.requesterName,
              approvedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
              studentId: adv.id,
            });
          }
        }
      }

      await batch.commit();

      Swal.fire({
        icon: "success",
        title: "อนุมัติสำเร็จ",
        text: "คำขอไปราชการได้รับการอนุมัติ และบันทึกข้อมูลเรียบร้อยแล้ว",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });

      fetchRequests();
    } catch (err: any) {
      console.error("Error approving travel request:", err);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: err.message || "ไม่สามารถดำเนินการอนุมัติได้",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
    }
  };

  // 6. Reject Handler (Common for both requests)
  const handleRejectRequest = async (docPath: string) => {
    const result = await Swal.fire({
      title: "ต้องการไม่อนุมัติคำขอนี้?",
      text: "การดำเนินการนี้ไม่สามารถย้อนกลับได้",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#ef4444",
      cancelButtonColor: "#374151",
      confirmButtonText: "ไม่อนุมัติ",
      cancelButtonText: "ยกเลิก",
      background: isDarkMode ? "#2a2b2f" : "#fff",
      color: isDarkMode ? "#ffffff" : "#111827",
    });

    if (!result.isConfirmed) return;

    try {
      const docRef = doc(firestore, docPath);
      const batch = writeBatch(firestore);
      batch.update(docRef, {
        status: "rejected",
        rejectedBy: user?.fullName || "ฝ่ายบุคคล",
        rejectedAt: serverTimestamp(),
      });
      await batch.commit();

      Swal.fire({
        icon: "success",
        title: "ปฏิเสธคำขอเรียบร้อย",
        text: "สถานะคำขอถูกตั้งค่าเป็น ไม่อนุมัติ",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });

      fetchRequests();
    } catch (err: any) {
      console.error("Error rejecting request:", err);
      Swal.fire({
        icon: "error",
        title: "เกิดข้อผิดพลาด",
        text: err.message || "ไม่สามารถปฏิเสธคำขอได้",
        background: isDarkMode ? "#2a2b2f" : "#fff",
        color: isDarkMode ? "#ffffff" : "#111827",
      });
    }
  };

  // Filtering Logic
  const thaiDate = (ts?: Timestamp) =>
    ts
      ? ts.toDate().toLocaleDateString("th-TH", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "-";

  const getDaysCount = (start: Timestamp, end: Timestamp) => {
    const diffTime = Math.abs(end.toDate().getTime() - start.toDate().getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const filteredLeaves = leaveRequests.filter((r) => {
    const matchesSearch = r.teacherName.toLowerCase().includes(searchTerm.toLowerCase()) || r.leaveType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all"
      ? true
      : statusFilter === "pending"
        ? (r.status === "pending" || (r.status === "substitution_assigned" && !r.approvedBy))
        : statusFilter === "approved"
          ? (r.status === "approved" || (r.status === "substitution_assigned" && !!r.approvedBy))
          : r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredTravels = travelRequests.filter((r) => {
    const matchesSearch = r.requesterName.toLowerCase().includes(searchTerm.toLowerCase()) || r.subject.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all"
      ? true
      : statusFilter === "pending"
        ? (r.status === "pending" || (r.status === "substitution_assigned" && !r.approvedBy))
        : statusFilter === "approved"
          ? (r.status === "approved" || (r.status === "substitution_assigned" && !!r.approvedBy))
          : r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <MainLayout>
      <div className="p-6 min-h-screen bg-gray-50 dark:bg-[#1a1b1e] text-gray-900 dark:text-white transition-colors duration-300">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div className="flex items-center gap-4">
            <BackButton />
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-teal-500 to-indigo-500 bg-clip-text text-transparent">
                อนุมัติการลา & ไปราชการ (ฝ่ายบุคคล)
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                พิจารณาคำขอลาและใบไปราชการของคณะครูและบุคลากร
              </p>
            </div>
          </div>
        </div>

        {/* Tab Filters and Controls */}
        <div className="bg-white dark:bg-[#2a2b2f] p-5 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 mb-8 transition-colors">
          <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-5">
            {/* Tabs */}
            <div className="flex bg-gray-100 dark:bg-[#1a1b1e] p-1.5 rounded-xl self-start">
              <button
                onClick={() => {
                  setActiveTab("leave");
                  setStatusFilter("pending");
                }}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "leave"
                    ? "bg-white dark:bg-[#2a2b2f] shadow-sm text-teal-600 dark:text-teal-400"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                คำขอลาหยุดงาน ({leaveRequests.filter((r) => r.status === "pending" || (r.status === "substitution_assigned" && !r.approvedBy)).length})
              </button>
              <button
                onClick={() => {
                  setActiveTab("travel");
                  setStatusFilter("pending");
                }}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === "travel"
                    ? "bg-white dark:bg-[#2a2b2f] shadow-sm text-indigo-600 dark:text-indigo-400"
                    : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                }`}
              >
                คำขอไปราชการ ({travelRequests.filter((r) => r.status === "pending" || (r.status === "substitution_assigned" && !r.approvedBy)).length})
              </button>
            </div>

            {/* Filter by Status & Search */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Status Selectors */}
              <div className="flex bg-gray-100 dark:bg-[#1a1b1e] p-1 rounded-xl">
                {(["pending", "approved", "rejected", "all"] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setStatusFilter(filter)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all capitalize ${
                      statusFilter === filter
                        ? "bg-white dark:bg-[#2a2b2f] shadow-sm text-gray-900 dark:text-white"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    }`}
                  >
                    {filter === "pending"
                      ? "รออนุมัติ"
                      : filter === "approved"
                      ? "อนุมัติแล้ว"
                      : filter === "rejected"
                      ? "ไม่อนุมัติ"
                      : "ทั้งหมด"}
                  </button>
                ))}
              </div>

              {/* Search Bar */}
              <div className="relative min-w-[240px]">
                <Search className="absolute left-3 top-3 text-gray-400 w-4.5 h-4.5" />
                <input
                  type="text"
                  placeholder={activeTab === "leave" ? "ค้นหาชื่อผู้ลา, ชนิดการลา..." : "ค้นหาชื่อครู, หัวข้อราชการ..."}
                  className="pl-10 pr-4 py-2 w-full bg-gray-100 dark:bg-[#1a1b1e] border-0 rounded-xl text-sm focus:ring-2 focus:ring-teal-500 outline-none transition-all placeholder-gray-400"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content list */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">กำลังโหลดคำขอและประวัติรายการ...</p>
          </div>
        ) : (
          <div>
            {activeTab === "leave" ? (
              filteredLeaves.length === 0 ? (
                <div className="bg-white dark:bg-[#2a2b2f] text-center p-16 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบรายการคำขอลาที่ตรงกับเงื่อนไข</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-6">
                  {filteredLeaves.map((r) => {
                    const teacherData = teachers.get(r.teacherDocId);
                    return (
                      <div
                        key={r.id}
                        className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-800 p-6 transition-all duration-300 flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
                      >
                        {/* Left: Info */}
                        <div className="flex gap-4 items-start">
                          <ProfileAvatar
                            src={teacherData?.profileImageUrl || `https://ui-avatars.com/api/?name=${r.teacherName}&background=random`}
                            alt={r.teacherName}
                            className="w-14 h-14 rounded-full border border-gray-100 dark:border-gray-700 object-cover shadow-sm"
                          />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-lg text-gray-900 dark:text-white">
                                {r.teacherName}
                              </span>
                              <span className="text-xs text-gray-400 dark:text-gray-500">
                                ({teacherData?.teacherId || "ไม่มีรหัส"})
                              </span>
                              <span className="px-2 py-0.5 bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 text-xs font-bold rounded-md">
                                {r.leaveType}
                              </span>
                              {r.requiresSubstitute && (
                                <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-md">
                                  ต้องการสอนแทน
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              สังกัด/กลุ่มสาระ: {teacherData?.department || "ไม่ระบุ"}
                            </p>

                            <div className="flex flex-wrap gap-x-4 gap-y-1 items-center mt-3 text-sm text-gray-600 dark:text-gray-300">
                              <span className="flex items-center gap-1.5">
                                <Calendar className="w-4 h-4 text-gray-400" />
                                {thaiDate(r.startDate)} - {thaiDate(r.endDate)}
                              </span>
                              <span className="text-xs text-gray-400 font-semibold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                                รวม {getDaysCount(r.startDate, r.endDate)} วัน
                              </span>
                            </div>

                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-[#1a1b1e] p-3 rounded-xl border border-gray-100 dark:border-gray-800/50">
                              <span className="font-semibold text-gray-800 dark:text-gray-200">เหตุผลการลา:</span> {r.reason || "ไม่ระบุ"}
                            </p>

                            {r.docNo && (
                              <p className="text-xs text-gray-400 mt-2">
                                เลขที่เอกสาร: {r.docNo} | ยื่นคำขอเมื่อ: {thaiDate(r.createdAt)}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right: Actions / Status */}
                        <div className="flex flex-col items-stretch md:items-end gap-3 min-w-[140px] w-full md:w-auto">
                          {r.status === "pending" || (r.status === "substitution_assigned" && !r.approvedBy) ? (
                            <div className="flex flex-row md:flex-col gap-2.5 w-full">
                              <button
                                onClick={() => handleApproveLeave(r)}
                                className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5"
                              >
                                <Check className="w-4 h-4" /> อนุมัติ
                              </button>
                              <button
                                onClick={() => handleRejectRequest(r.docPath)}
                                className="flex-1 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5"
                              >
                                <X className="w-4 h-4" /> ปฏิเสธ
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-col items-stretch md:items-end gap-1">
                              <span
                                className={`px-4 py-1.5 text-center text-sm font-bold rounded-full inline-flex items-center gap-1.5 ${
                                  r.status === "approved" || (r.status === "substitution_assigned" && !!r.approvedBy)
                                    ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200/30"
                                    : "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/30"
                                }`}
                              >
                                {r.status === "approved" || (r.status === "substitution_assigned" && !!r.approvedBy) ? (
                                  <>
                                    <CheckCircle className="w-4.5 h-4.5" /> อนุมัติแล้ว {r.status === "substitution_assigned" && "(จัดสอนแทนแล้ว)"}
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-4.5 h-4.5" /> ไม่อนุมัติ
                                  </>
                                )}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : filteredTravels.length === 0 ? (
              <div className="bg-white dark:bg-[#2a2b2f] text-center p-16 rounded-2xl border border-gray-100 dark:border-gray-800">
                <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบคำขอไปราชการที่ตรงกับเงื่อนไข</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {filteredTravels.map((r) => {
                  const teacherData = teachers.get(r.requesterId);
                  return (
                    <div
                      key={r.id}
                      className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-800 p-6 transition-all duration-300 flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
                    >
                      {/* Left: Info */}
                      <div className="flex gap-4 items-start">
                        <ProfileAvatar
                          src={teacherData?.profileImageUrl || `https://ui-avatars.com/api/?name=${r.requesterName}&background=random`}
                          alt={r.requesterName}
                          className="w-14 h-14 rounded-full border border-gray-100 dark:border-gray-700 object-cover shadow-sm"
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-lg text-gray-900 dark:text-white">
                              {r.requesterName}
                            </span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              ({teacherData?.teacherId || "ไม่มีรหัส"})
                            </span>
                            <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-bold rounded-md">
                              ไปราชการ
                            </span>
                            {r.requiresSubstitute && (
                              <span className="px-2 py-0.5 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold rounded-md">
                                ต้องการสอนแทน
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            ตำแหน่ง: {r.position} | กลุ่มสาระ: {r.department}
                          </p>

                          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center mt-3 text-sm text-gray-600 dark:text-gray-300">
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-4 h-4 text-gray-400" />
                              {thaiDate(r.startDate)} - {thaiDate(r.endDate)}
                            </span>
                            <span className="text-xs text-gray-400 font-semibold bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                              รวม {getDaysCount(r.startDate, r.endDate)} วัน
                            </span>
                          </div>

                          <div className="mt-2 space-y-1">
                            <p className="text-sm text-gray-800 dark:text-gray-100 font-bold">
                              เรื่อง: <span className="font-normal text-gray-600 dark:text-gray-300">{r.subject}</span>
                            </p>
                            <p className="text-sm text-gray-800 dark:text-gray-100 font-bold">
                              สถานที่: <span className="font-normal text-gray-600 dark:text-gray-300">{r.location}</span>
                            </p>
                            <p className="text-sm text-gray-800 dark:text-gray-100 font-bold">
                              รายละเอียด/เหตุผล: <span className="font-normal text-gray-600 dark:text-gray-400">{r.reason}</span>
                            </p>
                          </div>

                          {r.coAdventurers && r.coAdventurers.length > 0 && (
                            <div className="mt-3">
                              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">
                                ผู้ร่วมเดินทาง ({r.coAdventurers.length} คน):
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {r.coAdventurers.map((adv, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-xs rounded"
                                  >
                                    {adv.name} ({adv.type === "student" ? "นักเรียน" : "ครู"})
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {r.docNo && (
                            <p className="text-xs text-gray-400 mt-2">
                              เลขที่คำสั่ง: {r.docNo} | ยื่นคำขอเมื่อ: {thaiDate(r.createdAt)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions / Status */}
                      <div className="flex flex-col items-stretch md:items-end gap-3 min-w-[140px] w-full md:w-auto">
                        {r.status === "pending" || (r.status === "substitution_assigned" && !r.approvedBy) ? (
                          <div className="flex flex-row md:flex-col gap-2.5 w-full">
                            <button
                              onClick={() => handleApproveTravel(r)}
                              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-sm rounded-xl transition-all shadow-sm hover:shadow flex items-center justify-center gap-1.5"
                            >
                              <Check className="w-4 h-4" /> อนุมัติ
                            </button>
                            <button
                              onClick={() => handleRejectRequest(r.docPath)}
                              className="flex-1 px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-1.5"
                            >
                              <X className="w-4 h-4" /> ปฏิเสธ
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-stretch md:items-end gap-1">
                            <span
                              className={`px-4 py-1.5 text-center text-sm font-bold rounded-full inline-flex items-center gap-1.5 ${
                                r.status === "approved" || (r.status === "substitution_assigned" && !!r.approvedBy)
                                  ? "bg-green-50 text-green-700 dark:bg-green-950/20 dark:text-green-400 border border-green-200/30"
                                  : "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400 border border-red-200/30"
                              }`}
                            >
                              {r.status === "approved" || (r.status === "substitution_assigned" && !!r.approvedBy) ? (
                                <>
                                  <CheckCircle className="w-4.5 h-4.5" /> อนุมัติแล้ว {r.status === "substitution_assigned" && "(จัดสอนแทนแล้ว)"}
                                </>
                              ) : (
                                <>
                                  <XCircle className="w-4.5 h-4.5" /> ไม่อนุมัติ
                                </>
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default LeaveApprovalPage;
