import React, { useState } from "react";
import { createPortal } from "react-dom";
import { doc, setDoc, arrayUnion } from "firebase/firestore";
import { firestore } from "@/firebase";
import { X, Briefcase, Check } from "lucide-react";
import { DEPARTMENT_CHATS } from "./chatConstants";

interface Props {
  schoolId: string;
  currentUid: string;
  alreadyJoinedRoomIds: string[];
  onClose: () => void;
  onJoined: (roomId: string) => void;
}

/**
 * ป็อปอัพ "เข้าร่วมฝ่ายงานอื่น" — ทางเข้าห้องแชทฝ่ายงานที่ยังไม่มีใครเพิ่มเราเข้าไปเลยสักครั้ง (bootstrap)
 * ต่างจาก DeptChatMemberPicker ตรงที่รายการที่เลือกคือ "ฝ่ายงาน" (fixed 4 ห้อง) ไม่ใช่ "คน" และเป็นการ
 * เพิ่มตัวเองเข้าห้องโดยตรง ไม่ต้องเป็นสมาชิกห้องไหนอยู่ก่อนก็กดเข้าร่วมห้องใหม่ได้ (เหมือน DeptChatMemberPicker)
 */
const JoinDeptChatModal: React.FC<Props> = ({ schoolId, currentUid, alreadyJoinedRoomIds, onClose, onJoined }) => {
  const [processingRoomId, setProcessingRoomId] = useState<string | null>(null);
  const joinedSet = new Set(alreadyJoinedRoomIds);

  const handleJoin = async (roomId: string) => {
    if (processingRoomId) return;
    setProcessingRoomId(roomId);
    try {
      await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
        memberUids: arrayUnion(currentUid),
      }, { mergeFields: ["memberUids"] });
      await setDoc(doc(firestore, "school-settings", schoolId, "teachers", currentUid), {
        deptChatRoomIds: arrayUnion(roomId),
      }, { mergeFields: ["deptChatRoomIds"] });
      onJoined(roomId);
    } catch (error) {
      console.error("Error joining dept chat:", error);
    } finally {
      setProcessingRoomId(null);
    }
  };

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
          <h3 className="font-bold text-gray-900 dark:text-white">เข้าร่วมแชทฝ่ายงาน</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {DEPARTMENT_CHATS.map((dept) => {
            const joined = joinedSet.has(dept.roomId);
            return (
              <div key={dept.roomId} className="flex items-center gap-3 rounded-xl p-2.5">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-600 text-white">
                  <Briefcase size={16} />
                </div>
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-gray-900 dark:text-white">{`แชท${dept.label}`}</p>
                <button
                  onClick={() => handleJoin(dept.roomId)}
                  disabled={processingRoomId === dept.roomId || joined}
                  className="flex shrink-0 items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-indigo-600 hover:text-white disabled:cursor-not-allowed disabled:bg-emerald-500 disabled:text-white dark:bg-white/10 dark:text-gray-300"
                >
                  {joined ? <><Check size={13} /> เข้าร่วมแล้ว</> : "เข้าร่วม"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default JoinDeptChatModal;
