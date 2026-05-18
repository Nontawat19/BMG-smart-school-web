import React, { useState, useEffect, useMemo } from "react";
// Precise UI Replica for Physical Rooms Management (EPP.5 Online Style)
import { useParams, Link } from "react-router-dom";
import { firestore as db } from "../../firebase";
import { motion, AnimatePresence } from "framer-motion";
import { collection, query, doc, writeBatch, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { useSelector } from "react-redux";
import { RootState } from "../../store";
import MainLayout from "@/layouts/MainLayout";
<<<<<<< HEAD
import BackButton from "@/components/Shared/BackButton";
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import {
    Building2,
    ChevronLeft,
    Search,
    Plus,
    Monitor,
    Home,
    Trash2,
    Edit3,
    Check,
    X,
    MoreVertical,
    LayoutGrid,
    Building
} from "lucide-react";
import Swal from "sweetalert2";

interface PhysicalRoom {
    id: string;
    roomName: string;
    roomCode: string;
    roomType: string;
    building: string;
    floor: string;
    capacity: number;
    isActive: boolean;
}

const PhysicalRoomsPage: React.FC = () => {
    const { schoolId: urlSchoolId } = useParams<{ schoolId?: string }>();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = urlSchoolId || (currentUser as any)?.schoolId;

    // Data States
    const [rooms, setRooms] = useState<PhysicalRoom[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");

    const [creationMode, setCreationMode] = useState<'single' | 'bulk'>('single');

    // Form States
    const [form, setForm] = useState({
        roomName: "",
        roomCode: "",
        roomType: "ห้องเรียนปกติ (Theory)",
        building: "",
        floor: "",
        capacity: 40,
        isActive: true
    });

    const [bulkForm, setBulkForm] = useState({
        building: "",
        floor: "",
        count: 1,
        prefix: "",
        roomType: "ห้องเรียนปกติ (Theory)",
        capacity: 40
    });

    // Fetch Rooms
    useEffect(() => {
        if (!schoolId) return;
        const q = query(collection(db, 'school-settings', schoolId, 'physical-rooms'), orderBy('roomName', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PhysicalRoom)));
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [schoolId]);

    const filteredRooms = useMemo(() => {
        return rooms.filter(r => 
            (r.roomName || "").toLowerCase().includes(searchQuery.toLowerCase()) || 
            (r.roomCode || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
            (r.building || "").toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [rooms, searchQuery]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.roomName || !form.roomCode) {
            Swal.fire('คำเตือน', 'กรุณาระบุชื่ออาคาร/ห้อง และรหัสห้อง', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            await addDoc(collection(db, 'school-settings', schoolId, 'physical-rooms'), {
                ...form,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            
            Swal.fire({
                icon: 'success',
                title: 'บันทึกข้อมูลสำเร็จ',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 2000
            });

            setForm({
                roomName: "",
                roomCode: "",
                roomType: "ห้องเรียนปกติ (Theory)",
                building: "",
                floor: "",
                capacity: 40,
                isActive: true
            });
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const toggleStatus = async (roomId: string, currentStatus: boolean) => {
        try {
            await updateDoc(doc(db, 'school-settings', schoolId, 'physical-rooms', roomId), {
                isActive: !currentStatus
            });
        } catch (error) {
            console.error(error);
        }
    };

    const handleBulkSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!bulkForm.building || !bulkForm.floor || bulkForm.count < 1) {
            Swal.fire('คำเตือน', 'กรุณาระบุข้อมูลอาคาร ชั้น และจำนวนห้อง', 'warning');
            return;
        }

        setIsSaving(true);
        try {
            const batch = writeBatch(db);
            const roomsRef = collection(db, 'school-settings', schoolId, 'physical-rooms');

            for (let i = 1; i <= bulkForm.count; i++) {
                const num = i.toString().padStart(2, '0');
                const roomCode = `${bulkForm.prefix}${num}`;
                const roomName = `${bulkForm.building} ชั้น ${bulkForm.floor} ห้องที่ ${i}`;
                const newDocRef = doc(roomsRef);
                
                batch.set(newDocRef, {
                    roomName,
                    roomCode,
                    roomType: bulkForm.roomType,
                    building: bulkForm.building,
                    floor: bulkForm.floor,
                    capacity: bulkForm.capacity,
                    isActive: true,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp()
                });
            }

            await batch.commit();
            Swal.fire('สำเร็จ', `สร้างห้องเรียนจำนวน ${bulkForm.count} ห้องเรียบร้อยแล้ว`, 'success');
            setCreationMode('single');
            setBulkForm({
                building: "",
                floor: "",
                count: 1,
                prefix: "",
                roomType: "ห้องเรียนปกติ (Theory)",
                capacity: 40
            });
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'ไม่สามารถสร้างข้อมูลแบบกลุ่มได้', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const deleteRoom = async (roomId: string) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: "ข้อมูลสถานที่นี้จะถูกลบออกจากระบบถาวร",
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ลบข้อมูล',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                await deleteDoc(doc(db, 'school-settings', schoolId, 'physical-rooms', roomId));
                Swal.fire('ลบแล้ว!', 'ข้อมูลห้องเรียนถูกลบออกจากระบบแล้ว', 'success');
            } catch (error) {
                console.error(error);
            }
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-[#0b0e14] text-slate-300 font-sans p-6 select-none">
                
                {/* Header - Precise Replica */}
                <div className="flex items-center gap-4 mb-10">
<<<<<<< HEAD
                    <BackButton to="/academic/hub/settings" />
=======
                    <Link to="/academic-admin" className="p-2.5 bg-[#1e2235] rounded-xl text-slate-400 hover:text-white transition-all border border-white/5">
                        <ChevronLeft size={20} />
                    </Link>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-indigo-600/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/10">
                            <LayoutGrid size={28} className="text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white tracking-tight leading-tight">ข้อมูลอาคารและสถานที่สอน</h1>
                            <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1">BMG — TOTAL PHYSICAL MANAGEMENT</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 max-w-[1600px] mx-auto">
                    
                    {/* Left Column: Form */}
                    <div className="xl:col-span-5 bg-[#161a27] rounded-[2.5rem] border border-white/5 p-8 shadow-2xl flex flex-col gap-8">
                        
                        <div className="flex bg-[#0b0e14] dark:bg-black/40 p-1.5 rounded-2xl border border-white/5">
                            <button 
                                onClick={() => setCreationMode('single')}
                                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all ${creationMode === 'single' ? 'bg-[#1e2235] text-indigo-400 shadow-xl border border-white/5' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                เพิ่มรายห้อง
                            </button>
                            <button 
                                onClick={() => setCreationMode('bulk')}
                                className={`flex-1 py-3 px-4 rounded-xl text-xs font-black transition-all ${creationMode === 'bulk' ? 'bg-[#1e2235] text-indigo-400 shadow-xl border border-white/5' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                สร้างแบบกลุ่ม (UNI STYLE)
                            </button>
                        </div>

                        {creationMode === 'single' ? (
                            <>
                                <div className="flex items-center gap-3">
                                    <Plus size={20} className="text-emerald-500" />
                                    <h3 className="text-lg font-black text-emerald-500">เพิ่มจุดการสอนใหม่</h3>
                                </div>

                        <form onSubmit={handleSave} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">ชื่อเต็มอาคาร / ห้องเรียน <span className="text-rose-500">*</span></label>
                                <input 
                                    type="text" 
                                    placeholder="เช่น ห้องปฏิบัติการวิทยาศาสตร์ 1"
                                    value={form.roomName}
                                    onChange={(e) => setForm({...form, roomName: e.target.value})}
                                    className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-indigo-500/50 transition-all placeholder:text-slate-600"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">รหัสห้อง</label>
                                    <input 
                                        type="text" 
                                        placeholder="เช่น 001"
                                        value={form.roomCode}
                                        onChange={(e) => setForm({...form, roomCode: e.target.value})}
                                        className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">คุณลักษณะห้อง</label>
                                    <div className="relative">
                                        <select 
                                            value={form.roomType}
                                            onChange={(e) => setForm({...form, roomType: e.target.value})}
                                            className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-indigo-500/50 appearance-none cursor-pointer"
                                        >
                                            <option>ห้องเรียนปกติ (Theory)</option>
                                            <option>ห้องแล็บ (Science Lab)</option>
                                            <option>ห้องปฏิบัติการคอมฯ (IT)</option>
                                            <option>โรงฝึกงาน (Workshop)</option>
                                            <option>ห้องดนตรี (Music Room)</option>
                                            <option>ห้องศิลปะ (Art Studio)</option>
                                            <option>ห้องนาฏศิลป์ / แดนซ์</option>
                                            <option>ห้องประชุม / สัมมนา</option>
                                            <option>หอประชุม (Auditorium)</option>
                                            <option>ห้องสมุด / ศูนย์สืบค้น</option>
                                            <option>สนามกีฬา / โรงยิม</option>
                                            <option>อื่นๆ / พื้นที่อเนกประสงค์</option>
                                        </select>
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none opacity-50">
                                            <LayoutGrid size={16} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">ระบุอาคาร</label>
                                    <input 
                                        type="text" 
                                        placeholder="เช่น อาคาร 4"
                                        value={form.building}
                                        onChange={(e) => setForm({...form, building: e.target.value})}
                                        className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">ชั้น</label>
                                    <input 
                                        type="text" 
                                        placeholder="เช่น ชั้น 2"
                                        value={form.floor}
                                        onChange={(e) => setForm({...form, floor: e.target.value})}
                                        className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-indigo-500/50 placeholder:text-slate-600"
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black text-sky-400 uppercase tracking-widest ml-1">จำนวนความจุสูงสุด (คน)</label>
                                <div className="bg-[#1e2235] border border-white/5 rounded-[1.5rem] p-4 flex flex-col items-center gap-1 shadow-inner">
                                    <input 
                                        type="number" 
                                        value={form.capacity}
                                        onChange={(e) => setForm({...form, capacity: Number(e.target.value)})}
                                        className="w-full bg-transparent text-3xl font-black text-white text-center outline-none"
                                    />
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">MAX CAPACITY</span>
                                </div>
                            </div>

                            <button 
                                type="submit"
                                disabled={isSaving}
                                className="w-full py-5 bg-[#0088cc] hover:bg-[#0077bb] text-white rounded-[1.5rem] font-black text-sm shadow-2xl shadow-sky-500/20 transition-all flex items-center justify-center gap-2 mt-4"
                            >
                                {isSaving ? "กำลังบันทึก..." : "บันทึกข้อมูลสถานที่"}
                            </button>
                        </form>
                            </>
                        ) : (
                            <>
                                <div className="flex items-center gap-3">
                                    <LayoutGrid size={20} className="text-sky-500" />
                                    <h3 className="text-lg font-black text-sky-500">สร้างแบบกลุ่ม (University Style)</h3>
                                </div>

                                <form onSubmit={handleBulkSave} className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">ระบุอาคาร / ตึก <span className="text-rose-500">*</span></label>
                                        <input 
                                            type="text" 
                                            placeholder="เช่น อาคาร 100 ปี"
                                            value={bulkForm.building}
                                            onChange={(e) => setBulkForm({...bulkForm, building: e.target.value})}
                                            className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-sky-500/50 placeholder:text-slate-600"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">ชั้น <span className="text-rose-500">*</span></label>
                                            <input 
                                                type="text" 
                                                placeholder="เช่น 5"
                                                value={bulkForm.floor}
                                                onChange={(e) => setBulkForm({...bulkForm, floor: e.target.value})}
                                                className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-sky-500/50 placeholder:text-slate-600"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">จำนวนห้องที่จะสร้าง <span className="text-rose-500">*</span></label>
                                            <input 
                                                type="number" 
                                                value={bulkForm.count}
                                                onChange={(e) => setBulkForm({...bulkForm, count: Math.max(1, Number(e.target.value))})}
                                                className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-sky-500/50"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">PREFIX รหัส (ถ้ามี)</label>
                                            <input 
                                                type="text" 
                                                placeholder="เช่น R"
                                                value={bulkForm.prefix}
                                                onChange={(e) => setBulkForm({...bulkForm, prefix: e.target.value})}
                                                className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-sky-500/50 placeholder:text-slate-600"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">คุณลักษณะห้อง</label>
                                            <select 
                                                value={bulkForm.roomType}
                                                onChange={(e) => setBulkForm({...bulkForm, roomType: e.target.value})}
                                                className="w-full bg-[#1e2235] border border-white/5 rounded-2xl px-5 py-4 text-sm font-bold text-white outline-none focus:border-sky-500/50 appearance-none cursor-pointer"
                                            >
                                                <option>ห้องเรียนปกติ (Theory)</option>
                                                <option>ห้องแล็บ (Science Lab)</option>
                                                <option>ห้องปฏิบัติการคอมฯ (IT)</option>
                                                <option>โรงฝึกงาน (Workshop)</option>
                                                <option>ห้องดนตรี (Music Room)</option>
                                                <option>ห้องศิลปะ (Art Studio)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div className="p-5 bg-[#0b0e14]/50 border border-white/5 rounded-3xl space-y-3">
                                        <h4 className="text-[10px] font-black text-sky-400 uppercase tracking-widest">แสดงตัวอย่าง (PREVIEW)</h4>
                                        <div className="space-y-1">
                                            <p className="text-[11px] font-bold text-slate-400">• รหัสจะเริ่มจาก: <span className="text-white">{bulkForm.prefix}01</span></p>
                                            <p className="text-[11px] font-bold text-slate-400">• ชื่อห้อง: <span className="text-sky-400">{bulkForm.building || "..."}</span> ชั้น <span className="text-sky-400">{bulkForm.floor || "..."}</span> ห้องที่ 1 - {bulkForm.count}</p>
                                        </div>
                                    </div>

                                    <button 
                                        type="submit"
                                        disabled={isSaving}
                                        className="w-full py-5 bg-[#0088cc] hover:bg-[#0077bb] text-white rounded-[1.5rem] font-black text-sm shadow-2xl shadow-sky-500/20 transition-all flex items-center justify-center gap-2"
                                    >
                                        {isSaving ? "กำลังสร้างแบบกลุ่ม..." : "สร้างห้องเรียนทั้งหมด"}
                                    </button>
                                </form>
                            </>
                        )}
                    </div>

                    {/* Right Column: Room List */}
                    <div className="xl:col-span-7 bg-[#0b0e14] rounded-[2.5rem] flex flex-col gap-6">
                        
                        <div className="flex items-center justify-between px-4">
                            <h3 className="text-xl font-black text-white">รายการสถานที่ทั้งหมด <span className="text-slate-600 ml-2">({filteredRooms.length})</span></h3>
                            <div className="relative w-64">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                                <input 
                                    type="text" 
                                    placeholder="ค้นหาจุดการสอน..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full pl-12 pr-4 py-3 bg-[#161a27] border border-white/5 rounded-xl text-sm font-bold outline-none text-white focus:border-indigo-500/50"
                                />
                            </div>
                        </div>

                        <div className="space-y-3 overflow-y-auto custom-scrollbar max-h-[800px] pr-2">
                            {filteredRooms.map(room => (
                                <div key={room.id} className="bg-[#161a27] p-4 rounded-[1.5rem] border border-white/5 flex items-center justify-between group transition-all hover:bg-[#1c2133] hover:border-indigo-500/30 shadow-xl">
                                    <div className="flex items-center gap-5">
                                        <div className="w-12 h-12 rounded-2xl bg-[#0b0e14] border border-white/5 flex items-center justify-center shadow-inner shrink-0">
                                            {(room.roomType || '').includes('IT') || (room.roomType || '').includes('COMPUTER') || (room.roomType || '').includes('คอม') ? <Monitor size={20} className="text-indigo-400" /> : <Building size={20} className="text-indigo-400" />}
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <div className="flex items-center gap-2.5">
                                                <span className="text-xs font-black text-sky-400">{room.roomCode}</span>
                                                <h4 className="text-base font-black text-white tracking-tight">{room.roomName}</h4>
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500">
                                                <span>• อาคาร {room.building || "ไม่ระบุ"}</span>
                                                <span>ชั้น {room.floor || "ไม่ระบุ"}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-5">
                                        <div className="flex items-center gap-2.5">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${room.isActive ? 'text-emerald-500' : 'text-slate-600'}`}>เปิดใช้</span>
                                            <button 
                                                onClick={() => toggleStatus(room.id, room.isActive)}
                                                className={`w-12 h-6 rounded-full relative transition-all duration-300 ${room.isActive ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-[#1e2235]'}`}
                                            >
                                                <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-300 shadow-md" style={{ left: room.isActive ? '26px' : '2px' }} />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                                            <button className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl hover:bg-indigo-500 hover:text-white transition-all"><Edit3 size={15} /></button>
                                            <button 
                                                onClick={() => deleteRoom(room.id)}
                                                className="p-2 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"
                                            ><Trash2 size={15} /></button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {filteredRooms.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-40 text-slate-700 opacity-30">
                                    <Building2 size={64} strokeWidth={1} />
                                    <p className="text-sm font-black uppercase tracking-widest mt-6">ไม่พบข้อมูลสถานที่สอน</p>
                                </div>
                            )}
                        </div>

                    </div>

                </div>
            </div>

            <style>{`
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.1); }
            `}</style>
        </MainLayout>
    );
};

export default PhysicalRoomsPage;
