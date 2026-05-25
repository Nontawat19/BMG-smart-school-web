import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { CalendarDays, Clock, RefreshCw, Search } from "lucide-react";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from "@/components/SkeletonLoader";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { isActiveTeacherSummaryStatus } from "@/utils/ownerStatsUtils";

interface TeacherRow {
  id: string;
  teacherId: string;
  schoolName: string;
  date: string;
  fullName: string;
  position: string;
  checkInTime: string;
  checkOutTime: string;
  lateText: string;
  category: string;
  note: string;
  type: string;
}

const getTodayString = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });

const formatDateDisplay = (dateStr: string) => {
  if (!dateStr) return "-";
  const [year, month, day] = dateStr.split("-");
  return `${day}/${month}/${year}`;
};

const formatTime = (value: any) => {
  if (!value) return "-";
  if (value?.toDate) {
    return value.toDate().toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }
  if (typeof value === "string") return value;
  return "-";
};

const getDateValue = (value: any) => {
  if (!value) return "";
  if (value?.toDate) return value.toDate().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
  if (typeof value === "string") return value.slice(0, 10);
  return "";
};

const isDateInRange = (dateStr: string, start: any, end: any) => {
  const startStr = getDateValue(start);
  const endStr = getDateValue(end);
  return Boolean(startStr && endStr && startStr <= dateStr && endStr >= dateStr);
};

const getAttendanceCategory = (status?: string, hasAttendance?: boolean) => {
  if (!hasAttendance) return "-";
  if (status === "สาย" || status === "Late") return "สาย";
  if (status === "ลา" || status === "Leave") return "ลา";
  if (status === "ไปราชการ" || status === "OfficialTravel") return "ไปราชการ";
  if (status === "กลับก่อน") return "กลับก่อน";
  return "ปกติ";
};

const TeacherAttendanceDateSelectionPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [schoolName, setSchoolName] = useState("-");
  const [rows, setRows] = useState<TeacherRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!schoolId) return;

    const fetchRows = async () => {
      setLoading(true);
      setSelectedIds(new Set());
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        const schoolData = schoolSnap.exists() ? schoolSnap.data() : {};
        const currentSchoolName = schoolData.schoolName || schoolData.name || "-";
        setSchoolName(currentSchoolName);

        const teacherSnap = await getDocs(collection(firestore, "school-settings", schoolId, "teachers"));
        const activeTeachers = teacherSnap.docs
          .map((teacherDoc) => ({ id: teacherDoc.id, ...teacherDoc.data() } as any))
          .filter((teacher) => isActiveTeacherSummaryStatus(teacher.status || "อยู่"))
          .filter((teacher) => !isAttendanceEntryOnly(teacher.role));

        const nextRows = await Promise.all(activeTeachers.map(async (teacher) => {
          const teacherRef = doc(firestore, "school-settings", schoolId, "teachers", teacher.id);
          const [attendanceSnap, leaveSnap, travelSnap] = await Promise.all([
            getDoc(doc(teacherRef, "attendance", selectedDate)),
            getDocs(collection(teacherRef, "leave_summary")),
            getDocs(collection(teacherRef, "travel_summary")),
          ]);

          const attendance = attendanceSnap.exists() ? attendanceSnap.data() : null;
          const leaveDoc = leaveSnap.docs.find((leave) => {
            const data = leave.data();
            return data.status !== "rejected" && isDateInRange(selectedDate, data.startDate, data.endDate);
          });
          const travelDoc = travelSnap.docs.find((travel) => {
            const data = travel.data();
            return data.status !== "rejected" && isDateInRange(selectedDate, data.startDate, data.endDate);
          });

          const leaveData = leaveDoc?.data();
          const travelData = travelDoc?.data();
          const hasAttendance = Boolean(attendance);
          const category = travelData
            ? "ไปราชการ"
            : leaveData
              ? (leaveData.leaveType || "ลา")
              : getAttendanceCategory(attendance?.status, hasAttendance);
          const note = travelData
            ? (travelData.reason || "ไปราชการ")
            : leaveData
              ? (leaveData.reason || leaveData.leaveType || "ลา")
              : hasAttendance
                ? (attendance?.metadata?.description || attendance?.note || "ปกติ")
                : "เช็คขาดโดยระบบ";

          return {
            id: teacher.id,
            teacherId: teacher.teacherId || teacher.employeeId || "-",
            schoolName: currentSchoolName,
            date: formatDateDisplay(selectedDate),
            fullName: `${teacher.title || ""}${teacher.firstName || ""} ${teacher.lastName || ""}`.trim() || teacher.name || "-",
            position: teacher.position || teacher.department || "-",
            checkInTime: formatTime(attendance?.checkinTime || attendance?.time),
            checkOutTime: formatTime(attendance?.checkoutTime),
            lateText: attendance?.status === "สาย" || attendance?.status === "Late" ? "สาย" : "-",
            category,
            note,
            type: hasAttendance ? (attendance?.scanType || attendance?.checkinType || attendance?.type || "บัตร") : "-",
          };
        }));

        nextRows.sort((a, b) => {
          const aTime = a.checkInTime === "-" ? "99:99:99" : a.checkInTime;
          const bTime = b.checkInTime === "-" ? "99:99:99" : b.checkInTime;
          const timeCompare = aTime.localeCompare(bTime);
          if (timeCompare !== 0) return timeCompare;
          return a.fullName.localeCompare(b.fullName, "th", { numeric: true });
        });

        setRows(nextRows);
      } catch (error) {
        console.error("Error fetching teacher attendance by date:", error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [schoolId, selectedDate, refreshKey]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) =>
      row.fullName.toLowerCase().includes(keyword) ||
      row.teacherId.toLowerCase().includes(keyword) ||
      row.position.toLowerCase().includes(keyword) ||
      row.note.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm]);

  const allVisibleSelected = filteredRows.length > 0 && filteredRows.every((row) => selectedIds.has(row.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredRows.forEach((row) => next.delete(row.id));
      } else {
        filteredRows.forEach((row) => next.add(row.id));
      }
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-slate-50 dark:bg-[#1e1f21] px-4 py-6 text-slate-900 dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <BackButton to="/academic/hub/personnel_info" />
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400">
                  <Clock size={16} />
                  Personnel Attendance
                </div>
                <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                  ดูบันทึกการลงเวลาแบบเลือกวัน
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  ตรวจสอบเวลาเข้า-ออกงานของครูและบุคลากรตามวันที่เลือก
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:text-slate-300 dark:ring-slate-700">
              <CalendarDays size={16} className="text-indigo-500" />
              จำนวนทั้งหมด : {filteredRows.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
            <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.1fr_1fr_auto_auto] lg:items-end">
              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">โรงเรียน</span>
                <select
                  value={schoolId || ""}
                  disabled
                  className="h-10 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 text-sm text-slate-700 outline-none dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                >
                  <option value={schoolId || ""}>{schoolName}</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">วันที่ต้องการค้นหา</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => setSelectedDate(event.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                />
              </label>

              <button
                type="button"
                onClick={() => setRefreshKey((value) => value + 1)}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-sky-700 disabled:opacity-60"
                disabled={loading}
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                ค้นหารายการ
              </button>

              <label className="relative block">
                <span className="sr-only">ค้นหา</span>
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ค้นหาชื่อ/รหัส/ตำแหน่ง"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200 lg:w-64"
                />
              </label>
            </div>

            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[1120px] border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-[#323338] dark:text-slate-300">
                  <tr>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                      <label className="flex items-center gap-1">
                        <span>All</span>
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                      </label>
                    </th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">#</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">โรงเรียน</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">วันที่</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชื่อ-นามสกุล</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ตำแหน่ง</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เวลาบันทึกเข้า</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เวลาบันทึกออก</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">สาย</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ประเภท</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">หมายเหตุ</th>
                    <th className="border-b border-slate-200 px-3 py-3 dark:border-slate-700">type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-[#1e1f21]">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={12} className="px-3 py-2">
                          <SkeletonLoader height="24px" />
                        </td>
                      </tr>
                    ))
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        ไม่พบข้อมูลการลงเวลาตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-[#2a2b2f]">
                        <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-700">
                          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} />
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">{index + 1}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.schoolName}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.date}</td>
                        <td className="border-r border-slate-200 px-3 py-2 font-semibold whitespace-nowrap dark:border-slate-700">{row.fullName}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.position}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.checkInTime}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.checkOutTime}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.lateText}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.category}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.note}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.type}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default TeacherAttendanceDateSelectionPage;
