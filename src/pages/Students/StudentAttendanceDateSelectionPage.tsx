import React, { useEffect, useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock, RefreshCw, Search } from "lucide-react";
import { firestore } from "@/firebase";
import { RootState } from "@/store";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import SkeletonLoader from "@/components/SkeletonLoader";
import { isActiveStudentStatus } from "@/utils/studentStatusUtils";
import { CLASSES, getLevelsByRange } from "@/utils/schoolUtils";

interface StudentRow {
  id: string;
  studentId: string;
  studentNumber: string;
  schoolName: string;
  date: string;
  fullName: string;
  classText: string;
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

const getClassKey = (classLevel: string) => {
  const cleanLevel = String(classLevel || "").trim();
  return Object.keys(CLASSES).find(
    (key) => key === cleanLevel.toLowerCase() || CLASSES[key as keyof typeof CLASSES] === cleanLevel
  ) || cleanLevel.toLowerCase();
};

const getNumberValue = (value: string | number) => {
  const matched = String(value || "").match(/\d+/);
  return matched ? parseInt(matched[0], 10) : 999999;
};

const getAttendanceCategory = (status?: string, hasAttendance?: boolean) => {
  if (!hasAttendance) return "ขาด";
  if (status === "สาย" || status === "Late") return "สาย";
  if (status === "ลา" || status === "Leave") return "ลา";
  if (status === "ไปราชการ" || status === "OfficialTravel" || status === "officialTravel") return "ไปราชการ";
  if (status === "กลับก่อน") return "กลับก่อน";
  if (status === "ไม่ลงเวลาออก" || status === "NoCheckout") return "ไม่ลงเวลาออก";
  if (status === "ขาด" || status === "Absent") return "ขาด";
  return "ปกติ";
};

const getScanType = (attendance: any, hasAttendance: boolean) => {
  if (!hasAttendance) return "-";
  const rawType = (attendance?.scanType || attendance?.checkinType || attendance?.type || "").toString().toLowerCase().trim();
  if (rawType.includes("face") || rawType.includes("ใบหน้า") || rawType.includes("หน้า")) return "สแกนใบหน้า";
  if (rawType.includes("manual") || rawType.includes("พิมพ์") || rawType.includes("key") || rawType === "พิมพ์รหัสเอง") return "พิมพ์รหัสเอง";
  if (rawType.includes("rfid") || rawType.includes("บัตร") || rawType.includes("card") || rawType === "สแกนบัตร") return "สแกนบัตร";
  if (attendance?.metadata?.isGateCheckin) return "สแกนบัตร";
  return "-";
};

const StudentAttendanceDateSelectionPage: React.FC = () => {
  const { user: currentUser } = useSelector((state: RootState) => state.auth);
  const schoolId = currentUser?.schoolId;
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [schoolName, setSchoolName] = useState("-");
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);

  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    if (!schoolId) return;
    const fetchLevels = async () => {
      try {
        const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          const schoolData = schoolSnap.data();
          const levels = getLevelsByRange(schoolData.opportunityExpansionLevel || "");
          setAvailableLevels(levels);
        }
      } catch (error) {
        console.error("Error fetching school levels for dropdown:", error);
      }
    };
    fetchLevels();
  }, [schoolId]);

  const availableRooms = useMemo(() => {
    const rooms = new Set<string>();
    rows.forEach((row) => {
      const [c, r] = row.classText.split("/");
      if (selectedClassLevel) {
        if (c === selectedClassLevel && r) {
          rooms.add(r);
        }
      } else {
        if (r) {
          rooms.add(r);
        }
      }
    });
    return Array.from(rooms).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [rows, selectedClassLevel]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassLevel, selectedRoom, selectedDate]);

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

        const studentSnap = await getDocs(collection(firestore, "school-settings", schoolId, "students"));
        const activeStudents = studentSnap.docs
          .map((studentDoc) => ({ id: studentDoc.id, ...studentDoc.data() } as any))
          .filter((student) => isActiveStudentStatus(student.status || student.studentStatus));

        const nextRows = await Promise.all(activeStudents.map(async (student) => {
          const studentRef = doc(firestore, "school-settings", schoolId, "students", student.id);
          const [attendanceSnap, leaveSnap, travelSnap] = await Promise.all([
            getDoc(doc(studentRef, "attendance", selectedDate)),
            getDocs(collection(studentRef, "leave_summary")),
            getDocs(collection(studentRef, "travel_summary")),
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
          const isPending = (data: any) => data?.status === "pending";

          const category = travelData
            ? `ไปราชการ${isPending(travelData) ? " (รออนุมัติ)" : ""}`
            : leaveData
              ? `${leaveData.leaveType || "ลา"}${isPending(leaveData) ? " (รออนุมัติ)" : ""}`
              : getAttendanceCategory(attendance?.status, hasAttendance);

          const note = travelData
            ? `${isPending(travelData) ? "(รออนุมัติ) " : ""}ไปราชการ: ${travelData.reason || travelData.subject || "ไปราชการ"}${travelData.location ? ` [สถานที่: ${travelData.location}]` : ""}`
            : leaveData
              ? `${isPending(leaveData) ? "(รออนุมัติ) " : ""}[${leaveData.leaveType || "ลา"}] ${leaveData.reason || "ไม่ได้ระบุเหตุผล"}`
              : hasAttendance
                ? (attendance?.metadata?.description || attendance?.note || getAttendanceCategory(attendance?.status, true))
                : "ยังไม่มีข้อมูลลงเวลา";

          const classText = `${student.classLevel || student.level || "-"}${student.room || student.roomNumber ? `/${student.room || student.roomNumber}` : ""}`;

          return {
            id: student.id,
            studentId: student.studentId || "-",
            studentNumber: student.studentNumber || student.number || student.no || "-",
            schoolName: currentSchoolName,
            date: formatDateDisplay(selectedDate),
            fullName: `${student.title || ""}${student.firstName || ""} ${student.lastName || ""}`.trim() || student.name || "-",
            classText,
            checkInTime: formatTime(attendance?.checkinTime || attendance?.time),
            checkOutTime: formatTime(attendance?.checkoutTime),
            lateText: attendance?.status === "สาย" || attendance?.status === "Late" ? "สาย" : "-",
            category,
            note,
            type: getScanType(attendance, hasAttendance),
          };
        }));

        nextRows.sort((a, b) => {
          const [aClass, aRoom] = a.classText.split("/");
          const [bClass, bRoom] = b.classText.split("/");
          const classCompare = getClassKey(aClass).localeCompare(getClassKey(bClass), "en", { numeric: true });
          if (classCompare !== 0) return classCompare;
          const roomCompare = getNumberValue(aRoom).valueOf() - getNumberValue(bRoom).valueOf();
          if (roomCompare !== 0) return roomCompare;
          const numberCompare = getNumberValue(a.studentNumber) - getNumberValue(b.studentNumber);
          if (numberCompare !== 0) return numberCompare;
          return a.fullName.localeCompare(b.fullName, "th", { numeric: true });
        });

        setRows(nextRows);
      } catch (error) {
        console.error("Error fetching student attendance by date:", error);
        setRows([]);
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [schoolId, selectedDate, refreshKey]);

  const filteredRows = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    let result = rows;

    if (selectedClassLevel) {
      result = result.filter((row) => {
        const [c] = row.classText.split("/");
        return c === selectedClassLevel;
      });
    }

    if (selectedRoom) {
      result = result.filter((row) => {
        const [, r] = row.classText.split("/");
        return r === selectedRoom;
      });
    }

    if (!keyword) return result;
    return result.filter((row) =>
      row.fullName.toLowerCase().includes(keyword) ||
      row.studentId.toLowerCase().includes(keyword) ||
      row.studentNumber.toLowerCase().includes(keyword) ||
      row.classText.toLowerCase().includes(keyword) ||
      row.note.toLowerCase().includes(keyword)
    );
  }, [rows, searchTerm, selectedClassLevel, selectedRoom]);

  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRows, currentPage]);

  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);

  const allVisibleSelected = paginatedRows.length > 0 && paginatedRows.every((row) => selectedIds.has(row.id));

  const toggleAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        paginatedRows.forEach((row) => next.delete(row.id));
      } else {
        paginatedRows.forEach((row) => next.add(row.id));
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
      <div className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-[#1e1f21] dark:text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              <BackButton to="/academic/hub/students" />
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400">
                  <Clock size={16} />
                  Student Attendance
                </div>
                <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                  ดูบันทึกการลงเวลานักเรียนแบบเลือกวัน
                </h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  ตรวจสอบเวลาเข้า-ออกโรงเรียนของนักเรียนทั้งโรงเรียนตามวันที่เลือก
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:text-slate-300 dark:ring-slate-700">
              <CalendarDays size={16} className="text-indigo-500" />
              จำนวนทั้งหมด : {filteredRows.length}
            </div>
          </div>

          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-[#2a2b2f] dark:ring-slate-700">
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
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

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ชั้นเรียน</span>
                <select
                  value={selectedClassLevel}
                  onChange={(e) => setSelectedClassLevel(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200 font-bold"
                >
                  <option value="">ทุกชั้น</option>
                  {availableLevels.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-bold text-slate-700 dark:text-slate-300">ห้องเรียน</span>
                <select
                  value={selectedRoom}
                  onChange={(e) => setSelectedRoom(e.target.value)}
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200 font-bold"
                >
                  <option value="">ทุกห้อง</option>
                  {availableRooms.map((room) => (
                    <option key={room} value={room}>
                      ห้อง {room}
                    </option>
                  ))}
                </select>
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
                  placeholder="ค้นหาชื่อ/รหัส/หมายเหตุ"
                  className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-[#1e1f21] dark:text-slate-200"
                />
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full border-collapse text-left text-sm">
                <thead className="bg-slate-100 text-xs font-bold text-slate-700 dark:bg-[#323338] dark:text-slate-300">
                  <tr>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">
                      <label className="flex items-center gap-1">
                        <span>All</span>
                        <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} />
                      </label>
                    </th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 text-center dark:border-slate-700">เลขที่</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">รหัสนักเรียน</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชื่อ-นามสกุล</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ชั้น/ห้อง</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เวลาบันทึกเข้า</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">เวลาบันทึกออก</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">ประเภท</th>
                    <th className="border-b border-r border-slate-200 px-3 py-3 dark:border-slate-700">หมายเหตุ</th>
                    <th className="border-b border-slate-200 px-3 py-3 dark:border-slate-700">type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-[#1e1f21]">
                  {loading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <tr key={index}>
                        <td colSpan={10} className="px-3 py-2">
                          <SkeletonLoader height="24px" />
                        </td>
                      </tr>
                    ))
                  ) : paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                        ไม่พบข้อมูลการลงเวลาตามเงื่อนไขที่เลือก
                      </td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-[#2a2b2f]">
                        <td className="border-r border-slate-200 px-3 py-2 dark:border-slate-700">
                          <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleRow(row.id)} />
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 text-center font-bold dark:border-slate-700">
                          {row.studentNumber}
                        </td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.studentId}</td>
                        <td className="border-r border-slate-200 px-3 py-2 font-semibold whitespace-nowrap dark:border-slate-700">{row.fullName}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.classText}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.checkInTime}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.checkOutTime}</td>
                        <td className="border-r border-slate-200 px-3 py-2 whitespace-nowrap dark:border-slate-700">{row.category}</td>
                        <td className="border-r border-slate-200 px-3 py-2 min-w-[200px] max-w-[400px] break-words dark:border-slate-700">{row.note}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{row.type}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="mt-4 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-4 dark:border-slate-700 sm:flex-row">
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  แสดง {(currentPage - 1) * itemsPerPage + 1} ถึง{" "}
                  {Math.min(currentPage * itemsPerPage, filteredRows.length)} จาก{" "}
                  {filteredRows.length} รายการ
                </div>
                <div className="flex items-center gap-1.5 rounded-xl bg-slate-50 p-1 dark:bg-black/20">
                  <button
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="หน้าแรก"
                  >
                    <ChevronsLeft size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="ย้อนกลับ"
                  >
                    <ChevronLeft size={16} />
                  </button>

                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum = i + 1;
                      if (totalPages > 5) {
                        const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                        pageNum = start + i;
                      }
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`h-8 w-8 rounded-lg text-xs font-bold transition-all ${
                            currentPage === pageNum
                              ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/10"
                              : "text-slate-600 hover:bg-white dark:text-slate-400 dark:hover:bg-[#1e1f21]"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="ถัดไป"
                  >
                    <ChevronRight size={16} />
                  </button>
                  <button
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all hover:bg-white hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-[#1e1f21] dark:hover:text-white"
                    title="หน้าสุดท้าย"
                  >
                    <ChevronsRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </MainLayout>
  );
};

export default StudentAttendanceDateSelectionPage;
