import React, { useState } from "react";
import { Users, UserCheck, Trash2, Check, Download, Search, X, Filter, FolderOpen, Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Student {
    id: string;
    title: string;
    firstName: string;
    lastName: string;
    room: string;
    studentId: string;
    studentNumber?: string;
    classLevel: string;
    groupName?: string;
}

interface StudentGroupManagerProps {
    students: Student[];
    allStudents?: Student[];
    selectedStudentIds: string[];
    onToggleStudent: (id: string) => void;
    onSelectAll: (checked: boolean) => void;
    isEnrolledTab: boolean;
    onBatchEnroll?: () => void;
    onBatchUnenroll?: () => void;
    studentWorkload?: Record<string, number>;
    activeGroupFilter: string;
    setActiveGroupFilter: (group: string) => void;
    availableGroups?: string[];
}

const StudentGroupManager: React.FC<StudentGroupManagerProps> = ({
    students,
    allStudents = [],
    selectedStudentIds,
    onToggleStudent,
    onSelectAll,
    isEnrolledTab,
    onBatchEnroll,
    onBatchUnenroll,
    studentWorkload = {},
    activeGroupFilter = "ทั้งหมด",
    setActiveGroupFilter,
    availableGroups = []
}) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 30;

    // Filter students based on search
    const filteredStudents = React.useMemo(() => {
        let list = students;
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(s =>
                s.firstName.toLowerCase().includes(term) ||
                s.lastName.toLowerCase().includes(term) ||
                (s.studentId && s.studentId.includes(term))
            );
        }
        return list;
    }, [students, searchTerm]);

    // Reset to page 1 when search or students list changes
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, students.length]);

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
    const paginatedStudents = filteredStudents.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleShiftClick = (id: string, currentIds: string[]) => {
        if (!lastSelectedId) {
            setLastSelectedId(id);
            onToggleStudent(id);
            return;
        }

        const currentIndex = filteredStudents.findIndex(s => s.id === id);
        const lastIndex = filteredStudents.findIndex(s => s.id === lastSelectedId);

        if (currentIndex === -1 || lastIndex === -1) {
            onToggleStudent(id);
            setLastSelectedId(id);
            return;
        }

        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);
        const rangeIds = filteredStudents.slice(start, end + 1).map(s => s.id);

        // Simple toggle for now, ideally strictly ADD to selection
        onToggleStudent(id);
        setLastSelectedId(id);
    };

    const isAllSelected = filteredStudents.length > 0 && filteredStudents.every(s => selectedStudentIds.includes(s.id));

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#1e1f21]">
            {/* Toolbar: Premium Aesthetics */}
            <div className="flex flex-col border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1f21] sticky top-0 z-20">
                <div className="flex items-center justify-between p-3 gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#2a2b2f] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                            <Users size={14} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                                {filteredStudents.length} {isEnrolledTab ? "ที่เลือก" : "รายชื่อ"}
                            </span>
                        </div>
                        {/* Select All Checkbox */}
                        <label className="flex items-center gap-2 cursor-pointer select-none px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isAllSelected
                                ? "bg-indigo-600 border-indigo-600"
                                : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2b2f]"
                                }`}>
                                {isAllSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                            </div>
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                onChange={(e) => onSelectAll(e.target.checked)}
                                className="hidden"
                            />
                            <span className="text-[10px] uppercase font-bold text-gray-500">เลือกทั้งหมด</span>
                        </label>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="ค้นหานักเรียน..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-indigo-500 transition-colors dark:text-gray-200 w-40 sm:w-48"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 dark:bg-[#25262b] border-b border-gray-200 dark:border-gray-700 text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky top-[54.5px] z-10">
                <div className="col-span-1 text-center">#</div>
                <div className="col-span-2">รหัส</div>
                <div className="col-span-4">ชื่อ - นามสกุล</div>
                <div className="col-span-2 text-center">ระดับชั้น</div>
                <div className="col-span-1 text-center">สถานะ</div>
                <div className="col-span-2 text-center">ภาระงาน</div>
            </div>

            {/* Table Rows */}
            <div className="bg-white dark:bg-[#1e1f21]">
                {paginatedStudents.length > 0 ? (
                    paginatedStudents.map((s, idx) => {
                        const isSelected = selectedStudentIds.includes(s.id);
                        const workload = studentWorkload[s.id] || 0;

                        return (
                            <div
                                key={s.id}
                                onClick={(e) => {
                                    if (e.shiftKey) handleShiftClick(s.id, selectedStudentIds);
                                    else {
                                        onToggleStudent(s.id);
                                        setLastSelectedId(s.id);
                                    }
                                }}
                                className={`grid grid-cols-12 gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-800 items-center text-xs cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isSelected ? "bg-indigo-50/60 dark:bg-indigo-900/10" : ""
                                    }`}
                            >
                                <div className="col-span-1 flex justify-center">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "border-gray-300 dark:border-gray-600"
                                        }`}>
                                        {isSelected && <Check size={10} strokeWidth={3} />}
                                    </div>
                                </div>
                                <div className="col-span-2 font-mono text-gray-500 flex flex-col">
                                    <span>{s.studentId}</span>
                                    {s.studentNumber && <span className="text-[9px] text-gray-400">No. {s.studentNumber}</span>}
                                </div>
                                <div className={`col-span-4 font-bold ${isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-200"}`}>
                                    {s.title}{s.firstName} {s.lastName}
                                </div>
                                <div className="col-span-2 text-center">
                                    <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded text-[10px] text-gray-500 dark:text-gray-300">
                                        {s.classLevel}/{s.room}
                                    </span>
                                </div>
                                <div className="col-span-1 text-center">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                                        ปกติ
                                    </span>
                                </div>
                                <div className="col-span-2 flex justify-center">
                                    {workload > 0 ? (
                                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${workload >= 8 ? "bg-red-100 text-red-600" : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
                                            }`}>
                                            ลงแล้ว {workload}
                                        </span>
                                    ) : (
                                        <span className="text-[9px] text-gray-300">-</span>
                                    )}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400 space-y-2 opacity-60">
                        <FolderOpen size={48} strokeWidth={1} />
                        <span className="text-xs">ไม่พบข้อมูลนักเรียน</span>
                    </div>
                )}
            </div>

            {/* Pagination UI */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-1 p-4 bg-gray-50/50 dark:bg-white/5 border-b border-gray-100 dark:border-gray-800">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-white dark:hover:bg-gray-800 transition-all"
                    >
                        ก่อนหน้า
                    </button>
                    <div className="flex gap-1 mx-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1)
                            .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                            .map((p, i, arr) => (
                                <React.Fragment key={p}>
                                    {i > 0 && arr[i - 1] !== p - 1 && <span className="text-gray-400">...</span>}
                                    <button
                                        onClick={() => setCurrentPage(p)}
                                        className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${currentPage === p
                                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
                                            : "hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500"
                                            }`}
                                    >
                                        {p}
                                    </button>
                                </React.Fragment>
                            ))}
                    </div>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-30 hover:bg-white dark:hover:bg-gray-800 transition-all"
                    >
                        ถัดไป
                    </button>
                </div>
            )}

            {/* Footer Summary */}
            <div className="p-2 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-[#1e1f21] text-[10px] text-gray-400 text-right sticky bottom-0 z-20">
                Selected: {selectedStudentIds.length} / {filteredStudents.length}
            </div>
        </div>
    );
};

export default StudentGroupManager;
