import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { saveAs } from "file-saver";
import JSZip from "jszip";
import {
  Camera,
  CheckSquare,
  Download,
  Image,
  Loader2,
  Search,
  Square,
  Users,
  X,
} from "lucide-react";
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import { firestore as db } from "@/firebase";
import { usePermissions } from "@/hooks/usePermissions";
import { ROLES } from "@/constants/roles";
import { getClassLevelRank, getEffectiveLevelRange, getLevelsByRange } from "@/utils/schoolUtils";
import { isStudyingStudent } from "@/utils/studentStatusUtils";

interface Student {
  id: string;
  studentId?: string;
  studentNumber?: string;
  firstName?: string;
  lastName?: string;
  classLevel?: string;
  room?: string;
  profileImageUrl?: string;
  status?: string;
  studentStatus?: string;
  prefix?: string;
  title?: string;
}

interface Teacher {
  id: string;
  homeroomGrade?: string;
  homeroomRoom?: string;
  isHomeroomTeacher?: boolean;
}

const StudentPhotoDownloadPage: React.FC = () => {
  const { user: currentUser, hasRole, ADMIN_ACCESS, STAFF_ACCESS } = usePermissions();
  const schoolId = (currentUser as any)?.schoolId;
  const isAdmin = hasRole(ADMIN_ACCESS) || hasRole([ROLES.ACADEMIC_ADMIN, ROLES.DIRECTOR, ROLES.DEPT_HEAD, ROLES.STUDENT_AFFAIRS]);
  const isTeacher = hasRole([ROLES.TEACHER]);

  const [students, setStudents] = useState<Student[]>([]);
  const [teacherData, setTeacherData] = useState<Teacher | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<string[]>([]);
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);

  // Load data
  useEffect(() => {
    if (!schoolId) return;

    const load = async () => {
      setLoading(true);
      try {
        const uid = (currentUser as any)?.uid || (currentUser as any)?.id;

        // Load teacher homeroom info (for TEACHER role)
        if (isTeacher && !isAdmin && uid) {
          const teachersSnap = await getDocs(
            query(collection(db, "school-settings", schoolId, "teachers"), where("uid", "==", uid))
          );
          if (teachersSnap.empty) {
            // try by id field
            const teachersSnap2 = await getDocs(
              query(collection(db, "school-settings", schoolId, "teachers"), where("id", "==", uid))
            );
            if (!teachersSnap2.empty) {
              const t = teachersSnap2.docs[0];
              setTeacherData({ id: t.id, ...t.data() } as Teacher);
            }
          } else {
            const t = teachersSnap.docs[0];
            setTeacherData({ id: t.id, ...t.data() } as Teacher);
          }
        }

        // Load school grade range
        const schoolSnap = await getDoc(doc(db, "school-settings", schoolId));
        if (schoolSnap.exists()) {
          const schoolData = schoolSnap.data();
          const levelRange = getEffectiveLevelRange(
            schoolData.opportunityExpansionLevel,
            schoolData.schoolType
          );
          setAvailableLevels(getLevelsByRange(levelRange));
        }

        // Load students
        const studentsSnap = await getDocs(collection(db, "school-settings", schoolId, "students"));
        const allStudents: Student[] = studentsSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Student, "id">),
        }));
        setStudents(allStudents);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [schoolId, isTeacher, isAdmin, (currentUser as any)?.uid]);

  // Compute available rooms — filtered by class level if one is selected
  useEffect(() => {
    const base = selectedClassLevel
      ? students.filter((s) => s.classLevel === selectedClassLevel && isStudyingStudent(s))
      : students.filter(isStudyingStudent);
    const rooms = [
      ...new Set(base.map((s) => String(s.room || "").trim()).filter(Boolean)),
    ].sort((a, b) => Number(a) - Number(b));
    setAvailableRooms(rooms);
    setSelectedRoom("");
  }, [selectedClassLevel, students]);

  // Homeroom teacher's class
  const homeroomGrade = teacherData?.homeroomGrade?.trim() || "";
  const homeroomRoom = teacherData?.homeroomRoom?.trim() || "";

  // Filtered students based on role + UI filters
  const filteredStudents = useMemo(() => {
    let base = students.filter(isStudyingStudent);

    if (isAdmin) {
      if (selectedClassLevel) base = base.filter((s) => s.classLevel === selectedClassLevel);
      if (selectedRoom) base = base.filter((s) => String(s.room || "").trim() === selectedRoom);
    } else if (isTeacher) {
      if (!homeroomGrade || !homeroomRoom) return [];
      base = base.filter(
        (s) => s.classLevel === homeroomGrade && String(s.room || "").trim() === homeroomRoom
      );
    }

    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      base = base.filter(
        (s) =>
          (s.firstName || "").toLowerCase().includes(q) ||
          (s.lastName || "").toLowerCase().includes(q) ||
          (s.studentId || "").toLowerCase().includes(q) ||
          (s.studentNumber || "").toLowerCase().includes(q)
      );
    }

    return base.sort((a, b) => {
      const gradeA = getClassLevelRank(a.classLevel);
      const gradeB = getClassLevelRank(b.classLevel);
      if (gradeA !== gradeB) return gradeA - gradeB;
      const roomA = Number(a.room || 0);
      const roomB = Number(b.room || 0);
      if (roomA !== roomB) return roomA - roomB;
      return Number(a.studentNumber || a.studentId || 0) - Number(b.studentNumber || b.studentId || 0);
    });
  }, [students, isAdmin, isTeacher, selectedClassLevel, selectedRoom, homeroomGrade, homeroomRoom, searchText]);

  const studentsWithPhoto = filteredStudents.filter((s) => s.profileImageUrl);
  const studentsNoPhoto = filteredStudents.filter((s) => !s.profileImageUrl);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === studentsWithPhoto.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(studentsWithPhoto.map((s) => s.id)));
    }
  };

  const fetchImageBlob = async (url: string): Promise<Blob | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch {
      return null;
    }
  };

  const getStudentFileName = (s: Student, ext: string) => {
    const id = s.studentId || s.studentNumber || s.id;
    return `${id}.${ext}`;
  };

  const handleDownloadOne = async (student: Student) => {
    if (!student.profileImageUrl) return;
    setDownloadingId(student.id);
    try {
      const blob = await fetchImageBlob(student.profileImageUrl);
      if (!blob) return;
      const ext = student.profileImageUrl.split("?")[0].split(".").pop() || "jpg";
      saveAs(blob, getStudentFileName(student, ext));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadZip = useCallback(async (targetStudents: Student[]) => {
    const toDownload = targetStudents.filter((s) => s.profileImageUrl);
    if (toDownload.length === 0) return;

    setDownloading(true);
    try {
      const zip = new JSZip();
      await Promise.all(
        toDownload.map(async (s) => {
          const blob = await fetchImageBlob(s.profileImageUrl!);
          if (!blob) return;
          const ext = s.profileImageUrl!.split("?")[0].split(".").pop() || "jpg";
          zip.file(getStudentFileName(s, ext), blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      const classLabel =
        isAdmin && selectedClassLevel
          ? `${selectedClassLevel}${selectedRoom ? `-ห้อง${selectedRoom}` : ""}`
          : isTeacher
          ? `${homeroomGrade}-ห้อง${homeroomRoom}`
          : "ทั้งโรงเรียน";
      saveAs(content, `รูปภาพนักเรียน_${classLabel}_${new Date().toISOString().split("T")[0]}.zip`);
    } finally {
      setDownloading(false);
    }
  }, [isAdmin, isTeacher, selectedClassLevel, selectedRoom, homeroomGrade, homeroomRoom]);

  const handleDownloadSelected = () => {
    const targets = studentsWithPhoto.filter((s) => selectedIds.has(s.id));
    handleDownloadZip(targets);
  };

  const isHomeroomTeacher = isTeacher && !isAdmin && !!homeroomGrade && !!homeroomRoom;
  const showFilters = isAdmin;

  const displayClass =
    isAdmin
      ? selectedClassLevel
        ? `${selectedClassLevel}${selectedRoom ? ` ห้อง ${selectedRoom}` : ""}`
        : "ทั้งโรงเรียน"
      : isHomeroomTeacher
      ? `${homeroomGrade} ห้อง ${homeroomRoom}`
      : "";

  return (
    <MainLayout>
      <div className="px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 lg:py-8 min-h-screen bg-gray-50 dark:bg-[#1c1c24]">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
            <BackButton to="/academic/hub/students" className="shrink-0" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Camera size={24} className="text-indigo-500" />
                ดาวน์โหลดรูปภาพนักเรียน
              </h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                {isHomeroomTeacher
                  ? `ครูประจำชั้น ${homeroomGrade} ห้อง ${homeroomRoom} — ดาวน์โหลดได้เฉพาะห้องของตนเอง`
                  : "ดาวน์โหลดรูปภาพนักเรียนรายบุคคล หรือดาวน์โหลดทั้งห้อง/ทั้งโรงเรียน (ZIP)"}
              </p>
            </div>
          </div>

          {/* Teacher with no homeroom class */}
          {isTeacher && !isAdmin && !loading && !isHomeroomTeacher && (
            <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-6 text-center">
              <Users size={40} className="mx-auto mb-3 text-amber-500" />
              <p className="text-amber-700 dark:text-amber-400 font-semibold">ไม่พบข้อมูลครูประจำชั้น</p>
              <p className="text-amber-600 dark:text-amber-500 text-sm mt-1">
                คุณยังไม่ได้รับมอบหมายเป็นครูประจำชั้น กรุณาติดต่อผู้ดูแลระบบ
              </p>
            </div>
          )}

          {/* Filters (admin only) */}
          {showFilters && (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm mb-6 flex flex-wrap gap-3 items-end">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">ระดับชั้น</label>
                <select
                  value={selectedClassLevel}
                  onChange={(e) => setSelectedClassLevel(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1c1c24] text-gray-900 dark:text-white text-sm min-w-[120px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">ทั้งหมด</option>
                  {availableLevels.map((cl) => (
                    <option key={cl} value={cl}>
                      {cl}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">ห้อง</label>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="px-3 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1c1c24] text-gray-900 dark:text-white text-sm min-w-[100px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">ทุกห้อง</option>
                    {availableRooms.map((r) => (
                      <option key={r} value={r}>
                        ห้อง {r}
                      </option>
                    ))}
                  </select>
                </div>

              <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">ค้นหา</label>
                <div className="relative">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="ชื่อ / รหัสนักเรียน"
                    className="w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1c1c24] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {searchText && (
                    <button
                      onClick={() => setSearchText("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Search (teacher — no class filter needed) */}
          {!showFilters && isHomeroomTeacher && (
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm mb-6">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="ค้นหาชื่อ / รหัสนักเรียน"
                  className="w-full pl-9 pr-9 py-2 rounded-xl border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1c1c24] text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {searchText && (
                  <button
                    onClick={() => setSearchText("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {[...Array(12)].map((_, i) => (
                <div key={`skeleton-${i}`} className="rounded-xl overflow-hidden border border-gray-100 dark:border-white/10">
                  <div className="aspect-square w-full bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                  <div className="p-2 space-y-1.5">
                    <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                    <div className="h-2.5 w-1/2 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (isAdmin || isHomeroomTeacher) ? (
            <>
              {/* Stats + bulk actions */}
              <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 shadow-sm mb-6 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-4 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">
                    <span className="font-bold text-gray-900 dark:text-white">{filteredStudents.length}</span> คน
                    {displayClass ? ` · ${displayClass}` : ""}
                  </span>
                  <span className="text-green-600 dark:text-green-400">
                    <Image size={14} className="inline mr-1 mb-0.5" />
                    <span className="font-bold">{studentsWithPhoto.length}</span> มีรูป
                  </span>
                  <span className="text-gray-400 dark:text-gray-500">
                    <span className="font-bold">{studentsNoPhoto.length}</span> ไม่มีรูป
                  </span>
                  {selectedIds.size > 0 && (
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                      เลือกไว้ {selectedIds.size} คน
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {studentsWithPhoto.length > 0 && (
                    <button
                      onClick={toggleSelectAll}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold border border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-[#1c1c24] text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                      {selectedIds.size === studentsWithPhoto.length ? (
                        <CheckSquare size={15} className="text-indigo-500" />
                      ) : (
                        <Square size={15} />
                      )}
                      {selectedIds.size === studentsWithPhoto.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
                    </button>
                  )}
                  {selectedIds.size > 0 && (
                    <button
                      onClick={handleDownloadSelected}
                      disabled={downloading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-60"
                    >
                      {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      ดาวน์โหลดที่เลือก ({selectedIds.size})
                    </button>
                  )}
                  {studentsWithPhoto.length > 0 && selectedIds.size === 0 && (
                    <button
                      onClick={() => handleDownloadZip(filteredStudents)}
                      disabled={downloading}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-60"
                    >
                      {downloading ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                      ดาวน์โหลดทั้งหมด (ZIP)
                    </button>
                  )}
                </div>
              </div>

              {filteredStudents.length === 0 ? (
                <div className="text-center py-16 text-gray-400 dark:text-gray-500">
                  <Users size={48} className="mx-auto mb-3 opacity-30" />
                  <p>ไม่พบข้อมูลนักเรียน</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {filteredStudents.map((student) => {
                    const hasPhoto = !!student.profileImageUrl;
                    const isSelected = selectedIds.has(student.id);
                    return (
                      <div
                        key={student.id}
                        className={`relative bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-sm overflow-hidden transition-all duration-200 ${
                          isSelected ? "ring-2 ring-indigo-500 shadow-md" : "hover:shadow-md"
                        }`}
                      >
                        {/* Select checkbox */}
                        {hasPhoto && (
                          <button
                            onClick={() => toggleSelect(student.id)}
                            className="absolute top-2 left-2 z-10 w-6 h-6 flex items-center justify-center rounded-lg bg-white/80 dark:bg-black/50 backdrop-blur-sm shadow"
                          >
                            {isSelected ? (
                              <CheckSquare size={16} className="text-indigo-600" />
                            ) : (
                              <Square size={16} className="text-gray-400" />
                            )}
                          </button>
                        )}

                        {/* Photo */}
                        <div className="aspect-[3/4] bg-gray-100 dark:bg-[#1c1c24] relative overflow-hidden">
                          {hasPhoto ? (
                            <img
                              src={student.profileImageUrl}
                              alt={`${student.firstName} ${student.lastName}`}
                              className="w-full h-full object-cover object-top"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300 dark:text-gray-600">
                              <Camera size={28} />
                              <span className="text-xs">ไม่มีรูป</span>
                            </div>
                          )}
                        </div>

                        {/* Info */}
                        <div className="p-2">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
                            {student.classLevel} ห้อง {student.room}
                            {student.studentNumber ? ` · เลขที่ ${student.studentNumber}` : ""}
                          </p>
                        </div>

                        {/* Download button */}
                        {hasPhoto && (
                          <button
                            onClick={() => handleDownloadOne(student)}
                            disabled={downloadingId === student.id}
                            className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors border-t border-gray-100 dark:border-white/5"
                          >
                            {downloadingId === student.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Download size={12} />
                            )}
                            ดาวน์โหลด
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </MainLayout>
  );
};

export default StudentPhotoDownloadPage;
