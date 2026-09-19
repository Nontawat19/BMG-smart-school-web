import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { collection, doc, getDocs, setDoc, arrayUnion } from "firebase/firestore";
import { firestore } from "@/firebase";
import { X, Search, Plus, Check } from "lucide-react";

interface StaffOption {
  id: string;
  name: string;
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
  roomId: string;
  roomLabel: string;
  onClose: () => void;
}

/**
 * ป็อปอัพเพิ่มเพื่อนร่วมงานเข้าห้องแชทฝ่ายงาน (dept-*) — ต่างจาก GroupChatCreator ตรงที่ห้องมีอยู่แล้ว
 * (ไม่ต้องสร้างใหม่/ตั้งชื่อ) แค่เลือกแล้วเพิ่มเข้าไปทันทีทีละคน (เจ้าหน้าที่ทุกคนเพิ่มกันเองได้ ไม่ต้อง
 * เป็นสมาชิกอยู่ก่อนก็เพิ่มคนอื่น (หรือตัวเอง) เข้าได้ — ดู isDeptChatMember ใน firestore.rules)
 */
const DeptChatMemberPicker: React.FC<Props> = ({ schoolId, roomId, roomLabel, onClose }) => {
  const [allStaff, setAllStaff] = useState<StaffOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
    getDocs(teachersRef).then((snap) => {
      setAllStaff(snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim(),
          profileImageUrl: data.profileImageUrl || data.profileUrl || "",
        };
      }));
    }).catch((error) => console.error("Error loading staff for dept chat member picker:", error))
      .finally(() => setIsLoading(false));
  }, [schoolId]);

  const filteredStaff = searchTerm.trim()
    ? allStaff.filter((s) => s.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
    : allStaff;

  const addMember = async (staff: StaffOption) => {
    if (processingId) return;
    setProcessingId(staff.id);
    try {
      // เขียนแค่ field memberUids เท่านั้น (ไม่ต้องเป็นสมาชิกอยู่ก่อนก็เขียนได้ ตาม isDeptChatMember)
      await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
        memberUids: arrayUnion(staff.id),
      }, { mergeFields: ["memberUids"] });
      // เขียนอ้างอิงกลับไว้ที่เอกสารครูของคนที่ถูกเพิ่มด้วย เพื่อให้ ChatRoomList.tsx ของเขารู้ได้ว่า
      // ตัวเองอยู่ห้องฝ่ายงานไหนบ้าง โดยอ่านจากเอกสารตัวเอง (allow read: if true) แทนที่จะต้อง query
      // ห้องแชททุกห้องเพื่อเช็ค memberUids ตรงๆ (ซึ่งอ่านไม่ได้อยู่แล้วถ้ายังไม่ใช่สมาชิก)
      await setDoc(doc(firestore, "school-settings", schoolId, "teachers", staff.id), {
        deptChatRoomIds: arrayUnion(roomId),
      }, { mergeFields: ["deptChatRoomIds"] });
      setAddedIds((prev) => new Set(prev).add(staff.id));
    } catch (error) {
      console.error("Error adding member to dept chat:", error);
    } finally {
      setProcessingId(null);
    }
  };

  // render ผ่าน portal ไปที่ document.body — ปุ่มเปิดป็อปอัพนี้อยู่ในหน้าต่างแชทลอยตัวที่ซ้อนอยู่ลึก
  // เหมือนกับ GroupChatCreator (กัน position: fixed เพี้ยน และกัน "click outside" ของ Navbar/หน้าต่าง
  // แชทมาปิดของที่ไม่เกี่ยวข้องกัน) — stopPropagation ที่ mousedown ตั้งแต่ต้นทางเหมือนเดิม
  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-[#242526]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="truncate font-bold text-gray-900 dark:text-white">เพิ่มเพื่อนร่วมงาน</h3>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{roomLabel}</p>
          </div>
          <button onClick={onClose} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 p-2">
          <div className="relative">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาเจ้าหน้าที่/ครู"
              className="w-full rounded-full bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none dark:bg-white/5 dark:text-white"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">กำลังโหลดรายชื่อ...</p>
          ) : filteredStaff.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ไม่พบรายชื่อ</p>
          ) : (
            filteredStaff.map((staff) => {
              const isAdded = addedIds.has(staff.id);
              return (
                <div key={staff.id} className="flex items-center gap-3 rounded-xl p-2.5">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-sky-600">
                    <StaffAvatar name={staff.name} photoUrl={staff.profileImageUrl} />
                  </div>
                  <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-white">{staff.name}</p>
                  <button
                    onClick={() => addMember(staff)}
                    disabled={processingId === staff.id || isAdded}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-indigo-600 hover:text-white disabled:cursor-not-allowed disabled:bg-emerald-500 disabled:text-white dark:bg-white/10 dark:text-gray-300"
                    title={isAdded ? "เพิ่มแล้ว" : "เพิ่ม"}
                  >
                    {isAdded ? <Check size={16} /> : <Plus size={16} />}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DeptChatMemberPicker;
