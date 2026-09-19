import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { collection, doc, getDocs, serverTimestamp, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { firestore } from "@/firebase";
import { X, Search, Plus } from "lucide-react";
import { createGroupRoomId } from "./chatConstants";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { getClassLevelRank } from "@/utils/schoolUtils";

interface StudentOption {
  id: string;
  name: string;
  classLevel: string;
  room: string;
  profileImageUrl?: string;
}

// เยื้องจุด crop ขึ้นบน (center 20%) เหมือนที่ทำไว้ในจุดอื่นๆ ของแชท เพราะรูปหน้าตรงส่วนใหญ่มีพื้นที่
// ว่างใต้คางมากกว่าบนหัว ถ้า crop กลางเป๊ะจะตัดหัวขาด ไม่มีรูปก็ fallback ไปสร้างอวาตาร์จากชื่อแทน
const StudentAvatar: React.FC<{ name: string; photoUrl?: string }> = ({ name, photoUrl }) => (
  <img
    src={photoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`}
    alt={name}
    className="h-full w-full rounded-full object-cover object-[center_20%]"
  />
);

interface Props {
  schoolId: string;
  teacherUid: string;
  teacherName: string;
  onClose: () => void;
  onCreated: (roomId: string) => void;
}

/**
 * ป็อปอัพสร้างกลุ่มแชท (เช่น กลุ่มผู้ปกครองของห้องเรียน) — ครูตั้งชื่อกลุ่ม แล้วค้นหา/เพิ่มผู้ปกครอง
 * (อิงจากตัวนักเรียน) ทีละคนเข้ากลุ่มก่อนกดสร้างจริง ตามที่ขอ ไม่ใช่ปุ่ม "เพิ่มทั้งห้องรวดเดียว"
 */
const GroupChatCreator: React.FC<Props> = ({ schoolId, teacherUid, teacherName, onClose, onCreated }) => {
  const [groupName, setGroupName] = useState("");
  const [allStudents, setAllStudents] = useState<StudentOption[]>([]);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClassLevel, setSelectedClassLevel] = useState("");
  const [selectedRoom, setSelectedRoom] = useState("");
  const [selected, setSelected] = useState<StudentOption[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const studentsRef = collection(firestore, "school-settings", schoolId, "students");
    getDocs(studentsRef).then((snap) => {
      setAllStudents(snap.docs
        // แสดงเฉพาะนักเรียนที่สถานะ "กำลังศึกษาอยู่" เท่านั้น ตัดคนที่ย้าย/ลาออก/จบการศึกษาไปแล้วออก
        .filter((d) => isStudyingStudent(d.data()))
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            name: `${data.title || ""}${data.firstName || ""} ${data.lastName || ""}`.trim(),
            classLevel: data.classLevel || "",
            room: data.room || "",
            profileImageUrl: data.profileImageUrl || data.profileUrl || "",
          };
        }));
    }).catch((error) => console.error("Error loading students for group chat creator:", error))
      .finally(() => setIsLoadingStudents(false));
  }, [schoolId]);

  // ตัวเลือก "ชั้น" กับ "ห้อง" แยกกัน สำหรับกรองรายชื่อนักเรียนด้านล่างให้เร็วขึ้น (แทนการเลื่อนหา/
  // พิมพ์ค้นหาชื่อทีละคน) — เลือกชั้นก่อน ตัวเลือกห้องจะขยับให้เหลือแค่ห้องที่มีจริงในชั้นนั้น
  const classLevelOptions = useMemo(() => {
    const levels = Array.from(new Set(allStudents.map((s) => s.classLevel).filter(Boolean)));
    return levels.sort((a, b) => getClassLevelRank(a) - getClassLevelRank(b));
  }, [allStudents]);

  const roomOptions = useMemo(() => {
    const rooms = Array.from(new Set(
      allStudents
        .filter((s) => !selectedClassLevel || s.classLevel === selectedClassLevel)
        .map((s) => s.room)
        .filter(Boolean)
    ));
    return rooms.sort((a, b) => String(a).localeCompare(String(b), "th", { numeric: true }));
  }, [allStudents, selectedClassLevel]);

  const selectedIds = new Set(selected.map((s) => s.id));
  const filteredStudents = allStudents.filter((s) => {
    const matchesSearch = !searchTerm.trim() || s.name.toLowerCase().includes(searchTerm.trim().toLowerCase());
    const matchesClassLevel = !selectedClassLevel || s.classLevel === selectedClassLevel;
    const matchesRoom = !selectedRoom || String(s.room) === selectedRoom;
    return matchesSearch && matchesClassLevel && matchesRoom;
  });

  const addStudent = (student: StudentOption) => {
    if (selectedIds.has(student.id)) return;
    setSelected((prev) => [...prev, student]);
  };

  const removeStudent = (studentId: string) => {
    setSelected((prev) => prev.filter((s) => s.id !== studentId));
  };

  const handleCreate = async () => {
    const trimmedName = groupName.trim();
    if (!trimmedName || selected.length === 0 || isSaving) {
      setError(!trimmedName ? "กรุณาตั้งชื่อกลุ่ม" : "กรุณาเพิ่มผู้ปกครองอย่างน้อย 1 คน");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      const roomId = createGroupRoomId();
      await setDoc(doc(firestore, "school-settings", schoolId, "chatRooms", roomId), {
        type: "group",
        groupName: trimmedName,
        createdByUid: teacherUid,
        createdByName: teacherName,
        memberStudentIds: selected.map((s) => s.id),
        createdAt: serverTimestamp(),
      });
      // เขียนอ้างอิงกลุ่มไว้ที่เอกสารนักเรียนของสมาชิกแต่ละคน เพื่อให้ฝั่งผู้ปกครอง (anonymous session
      // ไม่มีสิทธิ์ query ห้องแชทโดยตรง) รู้ได้ว่าตัวเองอยู่กลุ่มไหนบ้าง โดยอ่านจากเอกสารลูกของตัวเอง
      // ซึ่งเปิดอ่านสาธารณะอยู่แล้ว (allow get: if true) — ไม่ต้องเปิดสิทธิ์ query ห้องแชทเพิ่ม
      await Promise.all(selected.map((s) =>
        updateDoc(doc(firestore, "school-settings", schoolId, "students", s.id), {
          groupChats: arrayUnion({ roomId, groupName: trimmedName }),
        })
      ));
      onCreated(roomId);
    } catch (err) {
      console.error("Error creating group chat:", err);
      setError("สร้างกลุ่มไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setIsSaving(false);
    }
  };

  // render ผ่าน portal ไปที่ document.body โดยตรง เพราะปุ่มเปิดป็อปอัพนี้อยู่ลึกเข้าไปในดรอปดาวน์แชท
  // ของ Navbar (ซึ่งเป็น position: absolute/fixed ซ้อนกันอยู่แล้ว) ถ้า render อยู่ในต้นไม้เดิม
  // position: fixed ของป็อปอัพนี้อาจไปอิงกับกรอบของดรอปดาวน์แทนที่จะเป็นทั้งหน้าจอจริงๆ
  //
  // สำคัญ: Navbar มี "click outside ปิดดรอปดาวน์แชท" ที่เช็คด้วย chatRef.current.contains(e.target)
  // บน document mousedown — เพราะป็อปอัพนี้ portal ออกไปอยู่นอก DOM ของดรอปดาวน์แล้ว (แม้ยังอยู่ใน
  // React tree เดิม) การคลิกอะไรก็ตามในป็อปอัพนี้จะถูกนับเป็น "คลิกนอกดรอปดาวน์" ทำให้ดรอปดาวน์ปิดและ
  // ลาก ChatRoomList (พ่อของป็อปอัพนี้) หายไปทั้งยวง ต้อง stopPropagation ที่ mousedown ตั้งแต่ต้นทาง
  // ก่อนจะลอยไปถึง document
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
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <h3 className="font-bold text-gray-900 dark:text-white">สร้างกลุ่มแชท</h3>
          <button onClick={onClose} className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        <div className="shrink-0 space-y-2 border-b border-gray-200 p-4 dark:border-gray-700">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="ชื่อกลุ่ม เช่น ผู้ปกครอง ป.6/1"
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-white"
          />
          {selected.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selected.map((s) => (
                <span key={s.id} className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300">
                  {s.name}
                  <button onClick={() => removeStudent(s.id)} className="text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200">
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5 p-2 pb-0">
          <div className="relative min-w-0 flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหานักเรียน"
              className="w-full rounded-full bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none dark:bg-white/5 dark:text-white"
            />
          </div>
          <select
            value={selectedClassLevel}
            onChange={(e) => { setSelectedClassLevel(e.target.value); setSelectedRoom(""); }}
            className="w-[76px] shrink-0 rounded-full bg-gray-100 px-2 py-2 text-xs font-bold text-gray-600 outline-none dark:bg-white/5 dark:text-gray-300"
          >
            <option value="">ชั้น</option>
            {classLevelOptions.map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
          </select>
          <select
            value={selectedRoom}
            onChange={(e) => setSelectedRoom(e.target.value)}
            className="w-[64px] shrink-0 rounded-full bg-gray-100 px-2 py-2 text-xs font-bold text-gray-600 outline-none dark:bg-white/5 dark:text-gray-300"
          >
            <option value="">ห้อง</option>
            {roomOptions.map((room) => (
              <option key={room} value={room}>{room}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {isLoadingStudents ? (
            <p className="py-8 text-center text-sm text-gray-400">กำลังโหลดรายชื่อนักเรียน...</p>
          ) : filteredStudents.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ไม่พบนักเรียน</p>
          ) : (
            filteredStudents.map((student) => {
              const isSelected = selectedIds.has(student.id);
              return (
                <div key={student.id} className="flex items-center gap-3 rounded-xl p-2.5">
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full bg-emerald-500">
                    <StudentAvatar name={student.name} photoUrl={student.profileImageUrl} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-gray-900 dark:text-white">{student.name}</p>
                    <p className="truncate text-xs text-gray-500 dark:text-gray-400">{`${student.classLevel}${student.room ? `/${student.room}` : ""}`}</p>
                  </div>
                  <button
                    onClick={() => addStudent(student)}
                    disabled={isSelected}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 hover:bg-indigo-600 hover:text-white disabled:cursor-not-allowed disabled:bg-emerald-500 disabled:text-white dark:bg-white/10 dark:text-gray-300"
                    title={isSelected ? "เพิ่มแล้ว" : "เพิ่ม"}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="shrink-0 border-t border-gray-200 p-3 dark:border-gray-700">
          {error && <p className="mb-2 text-center text-xs font-bold text-rose-600 dark:text-rose-400">{error}</p>}
          <button
            onClick={handleCreate}
            disabled={isSaving}
            className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSaving ? "กำลังสร้าง..." : `สร้างกลุ่ม${selected.length > 0 ? ` (${selected.length} คน)` : ""}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GroupChatCreator;
