import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { collection, getDocs } from "firebase/firestore";
import { firestore } from "@/firebase";
import { X, Search, MessageSquare, UsersRound } from "lucide-react";
import { isAttendanceOfficerAccount } from "./useChatMessages";
import { isAttendanceEntryOnly } from "@/utils/attendanceRoles";
import { ROLE_LABELS, Role } from "@/constants/roles";

export interface StaffContact {
  id: string;
  name: string;
  position?: string;
  department?: string;
  role?: string | string[];
  profileImageUrl?: string;
}

const StaffAvatar: React.FC<{ name: string; photoUrl?: string }> = ({ name, photoUrl }) => (
  <img
    src={photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`}
    alt={name}
    className="h-full w-full rounded-full object-cover object-[center_20%]"
  />
);

interface Props {
  schoolId: string;
  currentUid: string;
  onClose: () => void;
  onSelectUser: (targetUid: string) => void;
  onOpenGroupCreator?: () => void;
}

/**
 * ป็อปอัพเลือกครูและบุคลากรเพื่อเริ่มแชท 1 ต่อ 1
 * กรองไม่เอาบัญชีเจ้าหน้าที่ลงเวลา (isAttendanceOfficerAccount / isAttendanceEntryOnly)
 */
const StaffChatPickerModal: React.FC<Props> = ({
  schoolId,
  currentUid,
  onClose,
  onSelectUser,
  onOpenGroupCreator,
}) => {
  const [allStaff, setAllStaff] = useState<StaffContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDept, setSelectedDept] = useState<string>("all");

  useEffect(() => {
    if (!schoolId) return;
    const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
    getDocs(teachersRef)
      .then((snap) => {
        const staffList: StaffContact[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          // ไม่แสดงตัวเอง
          if (d.id === currentUid) return;

          // ไม่เอาเจ้าหน้าที่ลงเวลาทุกประเภท
          if (isAttendanceOfficerAccount(data)) return;
          if (isAttendanceEntryOnly(data.role)) return;

          // ไม่เอาคนที่สถานะไม่ใช่บุคลากรปัจจุบัน (เช่น ลาออก หรือย้าย)
          if (data.status && data.status !== "อยู่" && data.status !== "active") return;

          const fullName = `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim() || data.fullName || "ไม่ระบุชื่อ";

          // หานิยามบทบาท/ตำแหน่งแสดงผล
          let roleDisplay = data.position || "";
          if (!roleDisplay && data.role) {
            const primaryRole = Array.isArray(data.role) ? data.role[0] : data.role;
            roleDisplay = ROLE_LABELS[primaryRole as Role] || primaryRole;
          }

          staffList.push({
            id: d.id,
            name: fullName,
            position: roleDisplay,
            department: data.department || "",
            role: data.role,
            profileImageUrl: data.profileImageUrl || data.profileUrl || "",
          });
        });

        // เรียงลำดับตามชื่อ ก-ฮ
        staffList.sort((a, b) => a.name.localeCompare(b.name, "th"));
        setAllStaff(staffList);
      })
      .catch((error) => console.error("Error loading staff list for chat:", error))
      .finally(() => setIsLoading(false));
  }, [schoolId, currentUid]);

  const departments = useMemo(() => {
    const depts = Array.from(new Set(allStaff.map((s) => s.department).filter((d): d is string => Boolean(d))));
    return ["all", ...depts];
  }, [allStaff]);

  const filteredStaff = useMemo(() => {
    return allStaff.filter((staff) => {
      const matchesSearch =
        !searchTerm.trim() ||
        staff.name.toLowerCase().includes(searchTerm.trim().toLowerCase()) ||
        (staff.position && staff.position.toLowerCase().includes(searchTerm.trim().toLowerCase())) ||
        (staff.department && staff.department.toLowerCase().includes(searchTerm.trim().toLowerCase()));

      const matchesDept = selectedDept === "all" || staff.department === selectedDept;
      return matchesSearch && matchesDept;
    });
  }, [allStaff, searchTerm, selectedDept]);

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#242526]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <MessageSquare size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">แชทกับครูและบุคลากร</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">เลือกเพื่อนร่วมงานเพื่อเริ่มการสนทนา 1 ต่อ 1</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>

        {/* Group Chat Creator shortcut (if provided) */}
        {onOpenGroupCreator && (
          <div className="shrink-0 border-b border-gray-100 bg-gray-50/50 p-2.5 px-4 dark:border-gray-800 dark:bg-white/[0.02]">
            <button
              onClick={() => {
                onClose();
                onOpenGroupCreator();
              }}
              className="flex w-full items-center justify-between rounded-xl bg-indigo-50 p-2.5 px-3 text-left text-xs font-bold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25"
            >
              <span className="flex items-center gap-2">
                <UsersRound size={15} />
                ต้องการสร้างกลุ่มแชทผู้ปกครอง/นักเรียน?
              </span>
              <span className="underline">สร้างกลุ่ม &rarr;</span>
            </button>
          </div>
        )}

        {/* Search & Dept Filters */}
        <div className="shrink-0 space-y-2 p-3 pb-2">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อ, ตำแหน่ง หรือฝ่ายงาน..."
              className="w-full rounded-full bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none dark:bg-white/5 dark:text-white"
              autoFocus
            />
          </div>

          {departments.length > 2 && (
            <div className="flex gap-1.5 overflow-x-auto py-1 text-xs">
              {departments.map((dept) => (
                <button
                  key={dept}
                  onClick={() => setSelectedDept(dept)}
                  className={`shrink-0 rounded-full px-2.5 py-1 font-semibold transition ${
                    selectedDept === dept
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/10 dark:text-gray-300"
                  }`}
                >
                  {dept === "all" ? "ทั้งหมด" : dept}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Staff List */}
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-sm text-gray-400">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent mb-2" />
              กำลังโหลดรายชื่อครูและบุคลากร...
            </div>
          ) : filteredStaff.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              {searchTerm ? "ไม่พบรายชื่อที่ค้นหา" : "ไม่พบข้อมูลครูและบุคลากร"}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">
                บุคลากรทั้งหมด ({filteredStaff.length} คน)
              </div>
              {filteredStaff.map((staff) => (
                <button
                  key={staff.id}
                  onClick={() => {
                    onSelectUser(staff.id);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-indigo-50/70 dark:hover:bg-white/5"
                >
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-indigo-500 shadow-sm">
                    <StaffAvatar name={staff.name} photoUrl={staff.profileImageUrl} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{staff.name}</p>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                      {staff.position && <span className="truncate">{staff.position}</span>}
                      {staff.position && staff.department && <span>•</span>}
                      {staff.department && <span className="truncate">{staff.department}</span>}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 transition group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/15 dark:text-indigo-300">
                    แชท
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default StaffChatPickerModal;
