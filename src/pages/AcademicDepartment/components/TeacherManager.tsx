import React, { useState, useMemo, useRef, useEffect } from "react";
import { Users, Search, Check, Save, UserCheck, Trash2, LayoutGrid, Filter, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { createPortal } from "react-dom";

interface Teacher {
    id: string;
    teacherId: string;
    name: string;
    subjectGroup?: string;
    learningArea?: string;
    department?: string;
}

interface TeacherManagerProps {
    teachers: Teacher[];
    selectedTeacherIds: string[];
    onToggleTeacher: (id: string) => void;
    onSelectAll: (checked: boolean) => void;
    isAssignedTab: boolean;
    onBatchAssign?: () => void;
    onBatchAssignWithConfig?: (assignments: Record<string, { classLevels: string[], roomIds: string[] }>) => void;
    onBatchUnassign?: () => void;
    isSaving?: boolean;
    subjectGroups?: { id: string, name: string, code: string }[];
    classOptions?: { value: string, label: string }[];
    roomOptions?: { value: string, label: string }[];
    activeClassLevel?: string;
    activeRoom?: string;
}


// --- Smart Dropdown Component ---
interface DropdownSelectProps {
    value: string | string[];
    onChange: (val: any) => void;
    options: { value: string, label: string }[];
    placeholder: string;
    multiple?: boolean;
}

const DropdownSelect: React.FC<DropdownSelectProps> = ({ value, onChange, options, placeholder, multiple = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [coords, setCoords] = useState<{
        left: number;
        width: number;
        top?: number;
        bottom?: number;
        placement: 'top' | 'bottom';
        maxHeight: number;
    }>({ left: 0, width: 0, placement: 'bottom', maxHeight: 300 });
    const containerRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const spaceBelow = viewportHeight - rect.bottom;
            const spaceAbove = rect.top;

            const placement = (spaceBelow < 300 && spaceAbove > spaceBelow) ? 'top' : 'bottom';
            const availableSpace = placement === 'bottom' ? spaceBelow : spaceAbove;
            const maxHeight = Math.min(availableSpace - 16, 400);

            setCoords({
                left: rect.left,
                width: rect.width,
                placement,
                top: rect.bottom + 4,
                bottom: viewportHeight - rect.top + 4,
                maxHeight
            });
        }
    };

    const handleToggle = () => {
        if (!isOpen) {
            updatePosition();
            setIsOpen(true);
        } else {
            setIsOpen(false);
        }
    };

    const isSelected = (val: string) => {
        if (multiple && Array.isArray(value)) {
            return value.includes(val);
        }
        return value === val;
    };

    const toggleValue = (val: string) => {
        if (multiple) {
            const current = Array.isArray(value) ? value : [];
            if (val === 'all') {
                onChange([]);
            } else {
                if (current.includes(val)) {
                    onChange(current.filter(v => v !== val));
                } else {
                    onChange([...current, val]);
                }
            }
        } else {
            onChange(val);
            setIsOpen(false);
        }
    };

    const displayValue = useMemo(() => {
        if (multiple && Array.isArray(value)) {
            if (value.length === 0) return "ทั้งหมด";
            if (value.length === 1) return options.find(o => o.value === value[0])?.label || value[0];
            return `เลือก ${value.length} รายการ`;
        }
        return value === "all" || value === "ทั้งหมด" ? "ทั้งหมด" : (options.find(o => o.value === value)?.label || value);
    }, [value, multiple, options]);

    useEffect(() => {
        const handleScrollOrResize = () => { if (isOpen) updatePosition(); };
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isOpen]);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={handleToggle}
                className="w-full flex items-center justify-between pl-2.5 pr-2.5 py-1.5 text-[10px] font-black bg-gray-50/80 dark:bg-gray-800/80 border border-gray-100 dark:border-gray-700 rounded-lg text-gray-700 dark:text-gray-300 hover:border-indigo-500/30 transition-all outline-none"
            >
                <div className="flex items-center gap-2 overflow-hidden">
                    <LayoutGrid size={12} className="text-gray-400 shrink-0" />
                    <span className="truncate">{placeholder}: {displayValue}</span>
                </div>
                <ChevronDown size={10} className={`text-gray-400 shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex flex-col" onClick={() => setIsOpen(false)}>
                    <div className="absolute inset-0 bg-transparent" />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: coords.placement === 'top' ? 10 : -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: coords.placement === 'top' ? 10 : -10 }}
                        style={{
                            position: 'fixed',
                            left: coords.left,
                            width: coords.width,
                            top: coords.placement === 'bottom' ? coords.top : undefined,
                            bottom: coords.placement === 'top' ? coords.bottom : undefined,
                        }}
                        className="bg-white dark:bg-[#2a2b2f] border border-gray-100 dark:border-gray-700 rounded-lg shadow-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div
                            className="overflow-y-auto p-1 custom-scrollbar"
                            style={{ maxHeight: coords.maxHeight }}
                        >
                            <button
                                onClick={() => toggleValue("all")}
                                className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[10px] font-bold transition-colors ${isSelected("all") || (multiple && Array.isArray(value) && value.length === 0) ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                            >
                                <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${isSelected("all") || (multiple && Array.isArray(value) && value.length === 0) ? "bg-indigo-600 border-indigo-600" : "border-gray-300 dark:border-gray-600"}`}>
                                    {(isSelected("all") || (multiple && Array.isArray(value) && value.length === 0)) && <Check size={8} className="text-white" />}
                                </div>
                                ทั้งหมด
                            </button>
                            {options.map(opt => (
                                <button
                                    key={opt.value}
                                    onClick={() => toggleValue(opt.value)}
                                    className={`w-full flex items-center gap-2 text-left px-3 py-1.5 text-[10px] font-bold transition-colors ${isSelected(opt.value) ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}
                                >
                                    <div className={`w-3 h-3 rounded border flex items-center justify-center transition-colors ${isSelected(opt.value) ? "bg-indigo-600 border-indigo-600" : "border-gray-300 dark:border-gray-600"}`}>
                                        {isSelected(opt.value) && <Check size={8} className="text-white" />}
                                    </div>
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}
        </div>
    );
};

const TeacherManager: React.FC<TeacherManagerProps> = ({
    teachers,
    selectedTeacherIds,
    onToggleTeacher,
    onSelectAll,
    isAssignedTab,
    onBatchAssign,
    onBatchAssignWithConfig,
    onBatchUnassign,
    isSaving = false,
    subjectGroups = [],
    classOptions = [],
    roomOptions = [],
    activeClassLevel = "all",
    activeRoom = "all"
}) => {
    const [searchTerm, setSearchTerm] = useState("");
    const [activeSgFilter, setActiveSgFilter] = useState("ทั้งหมด");
    const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Config state for selected teachers
    const [assignmentConfigs, setAssignmentConfigs] = useState<Record<string, { classLevels: string[], roomIds: string[] }>>({});

    // Initialize config when teacher selected
    useEffect(() => {
        setAssignmentConfigs(prev => {
            const next = { ...prev };
            selectedTeacherIds.forEach(id => {
                if (!next[id]) {
                    // Use active filters as default if they are specific values
                    next[id] = {
                        classLevels: activeClassLevel !== "all" ? [activeClassLevel] : [],
                        roomIds: activeRoom !== "all" ? [activeRoom] : []
                    };
                }
            });
            // Cleanup unselected
            Object.keys(next).forEach(key => {
                if (!selectedTeacherIds.includes(key)) {
                    delete next[key];
                }
            });
            return next;
        });
    }, [selectedTeacherIds, activeClassLevel, activeRoom]);

    const itemsPerPage = 30;

    // Filter teachers based on search and subject group
    const filteredTeachers = useMemo(() => {
        let list = teachers;

        // Subject Group Filter
        if (activeSgFilter !== "ทั้งหมด") {
            list = list.filter(t => (t.subjectGroup || t.learningArea) === activeSgFilter);
        }

        // Search Term Filter
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            list = list.filter(t =>
                t.name.toLowerCase().includes(term) ||
                (t.teacherId && t.teacherId.toLowerCase().includes(term)) ||
                (t.subjectGroup && t.subjectGroup.toLowerCase().includes(term)) ||
                (t.learningArea && t.learningArea.toLowerCase().includes(term)) ||
                (t.department && t.department.toLowerCase().includes(term))
            );
        }
        return list;
    }, [teachers, searchTerm, activeSgFilter]);

    // Reset to page 1 when search or filters change
    React.useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, activeSgFilter, teachers.length]);

    const totalPages = Math.ceil(filteredTeachers.length / itemsPerPage);
    const paginatedTeachers = filteredTeachers.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleShiftClick = (id: string, currentIds: string[]) => {
        if (!lastSelectedId) {
            setLastSelectedId(id);
            onToggleTeacher(id);
            return;
        }

        const currentIndex = filteredTeachers.findIndex(t => t.id === id);
        const lastIndex = filteredTeachers.findIndex(t => t.id === lastSelectedId);

        if (currentIndex === -1 || lastIndex === -1) {
            onToggleTeacher(id);
            setLastSelectedId(id);
            return;
        }

        const start = Math.min(currentIndex, lastIndex);
        const end = Math.max(currentIndex, lastIndex);

        onToggleTeacher(id);
        setLastSelectedId(id);
    };

    const isAllSelected = filteredTeachers.length > 0 && filteredTeachers.every(t => selectedTeacherIds.includes(t.id));

    return (
        <div className="flex flex-col h-full bg-white dark:bg-[#1e1f21]">
            {/* Toolbar */}
            <div className="flex flex-col border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1e1f21] sticky top-0 z-20">
                <div className="flex items-center justify-between p-3 gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#2a2b2f] rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                            <Users size={14} className="text-gray-400" />
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                                {filteredTeachers.length} ท่าน
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
                            <span className="text-xs text-gray-600 dark:text-gray-400">เลือกทั้งหมด</span>
                        </label>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Search */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="ค้นหาครู..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:border-indigo-500 transition-colors dark:text-gray-200 w-40"
                            />
                        </div>
                    </div>
                </div>

                {/* Sub-toolbar: Subject Group Filter (Smart Dropdown) */}
                <div className="px-3 pb-3">
                    <DropdownSelect
                        value={activeSgFilter}
                        onChange={setActiveSgFilter}
                        options={subjectGroups.map(g => ({ value: g.name, label: g.name }))}
                        placeholder="กลุ่มสาระการเรียนรู้"
                    />
                </div>
            </div>

            {/* Header */}
            <div className="grid grid-cols-[32px_80px_1fr_100px_100px] gap-2 px-4 py-2 bg-gray-50 dark:bg-[#25262b] border-b border-gray-100 dark:border-gray-800 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 sticky top-[88px] z-10">
                <div className="text-center">#</div>
                <div>รหัสครู</div>
                <div>ชื่อ-นามสกุล</div>
                <div className="text-center">กลุ่มสาระฯ</div>
                <div className="text-center">ฝ่ายงาน</div>
            </div>

            {/* List */}
            <div className="p-2 space-y-1 overflow-y-auto min-h-0 flex-1 custom-scrollbar">
                {paginatedTeachers.map((teacher, index) => {
                    const isSelected = selectedTeacherIds.includes(teacher.id);
                    const teacherSubjectGroup = teacher.subjectGroup || teacher.learningArea || "";
                    return (
                        <div
                            key={teacher.id}
                            onClick={(e) => {
                                if (e.shiftKey) {
                                    handleShiftClick(teacher.id, selectedTeacherIds);
                                } else {
                                    onToggleTeacher(teacher.id);
                                    setLastSelectedId(teacher.id);
                                }
                            }}
                            className={`
                                group grid grid-cols-[32px_80px_1fr_100px_100px] gap-2 items-center p-2 rounded-lg border cursor-pointer transition-all
                                ${isSelected
                                    ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-500/30 shadow-sm z-10"
                                    : "bg-white dark:bg-[#1e1f21] border-gray-100 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 hover:shadow-sm"
                                }
                            `}
                        >
                            <div className="flex justify-center flex-shrink-0">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected
                                    ? "bg-indigo-600 border-indigo-600"
                                    : "border-gray-300 dark:border-gray-600 bg-white dark:bg-[#2a2b2f] group-hover:border-gray-400"
                                    }`}>
                                    {isSelected && <Check size={10} className="text-white" strokeWidth={4} />}
                                </div>
                            </div>

                            <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">
                                {teacher.teacherId || "-"}
                            </div>

                            <div className="min-w-0">
                                <span className={`text-[13px] font-bold ${isSelected ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-200"} truncate`}>
                                    {teacher.name}
                                </span>
                            </div>

                            <div className="text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${teacherSubjectGroup === "ภาษาไทย" ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" :
                                    teacherSubjectGroup === "คณิตศาสตร์" ? "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" :
                                        teacherSubjectGroup === "วิทยาศาสตร์และเทคโนโลยี" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" :
                                            teacherSubjectGroup === "สังคมศึกษา ศาสนา และวัฒนธรรม" ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" :
                                                teacherSubjectGroup === "สุขศึกษาและพลศึกษา" ? "bg-lime-50 text-lime-600 dark:bg-lime-900/20 dark:text-lime-400" :
                                                    teacherSubjectGroup === "ศิลปะ" ? "bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400" :
                                                        teacherSubjectGroup === "การงานอาชีพ" ? "bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400" :
                                                            teacherSubjectGroup === "ภาษาต่างประเทศ" ? "bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400" :
                                                                teacherSubjectGroup === "กิจกรรมพัฒนาผู้เรียน" ? "bg-teal-50 text-teal-600 dark:bg-teal-900/20 dark:text-teal-400" :
                                                                    teacherSubjectGroup === "ปฐมวัย" ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" :
                                                                        "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                    }`}>
                                    {teacherSubjectGroup || "-"}
                                </span>
                            </div>

                            <div className="text-center">
                                <span className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-300 rounded text-[10px]">
                                    {teacher.department || "-"}
                                </span>
                            </div>

                            {/* Configuration Row for Selected Items (Allow editing in both tabs) */}
                            {isSelected && (
                                <div
                                    className="col-span-12 lg:col-span-5 mt-2 pl-10 pr-2 flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200"
                                    onClick={(e) => e.stopPropagation()} // Prevent deselecting teacher when clicking dropdowns
                                >
                                    <div className="w-1/2">
                                        <DropdownSelect
                                            value={assignmentConfigs[teacher.id]?.classLevels || []}
                                            onChange={(val) => setAssignmentConfigs(prev => ({
                                                ...prev,
                                                [teacher.id]: { ...prev[teacher.id], classLevels: val }
                                            }))}
                                            options={classOptions}
                                            placeholder="ระดับชั้น"
                                            multiple={true}
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <DropdownSelect
                                            value={assignmentConfigs[teacher.id]?.roomIds || []}
                                            onChange={(val) => setAssignmentConfigs(prev => ({
                                                ...prev,
                                                [teacher.id]: { ...prev[teacher.id], roomIds: val }
                                            }))}
                                            options={roomOptions}
                                            placeholder="ห้องเรียน"
                                            multiple={true}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {paginatedTeachers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <Users size={48} className="mb-4 opacity-20" />
                        <p className="text-sm">ไม่พบรายชื่อครู</p>
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
            {/* Action Footer */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1e1f21] flex justify-between items-center sticky bottom-0 z-20">
                <div className="text-xs text-gray-500">
                    เลือก {selectedTeacherIds.length} รายการ
                </div>
                {selectedTeacherIds.length > 0 && (
                    <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        onClick={() => {
                            if (isAssignedTab) {
                                onBatchUnassign?.();
                            } else {
                                if (onBatchAssignWithConfig) {
                                    // No need to convert anymore, it's already in the correct format
                                    onBatchAssignWithConfig(assignmentConfigs);
                                } else {
                                    onBatchAssign?.();
                                }
                            }
                        }}
                        disabled={isSaving}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-white shadow-lg transition-all ${isAssignedTab
                            ? "bg-red-500 hover:bg-red-600 shadow-red-500/20"
                            : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-500/20"
                            }`}
                    >
                        {isSaving ? (
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            isAssignedTab ? <Trash2 size={16} /> : <Save size={16} />
                        )}
                        {isAssignedTab ? "ถอนผู้สอน" : "บันทึกผู้สอน"}
                    </motion.button>
                )}
            </div>
        </div>
    );
};

export default TeacherManager;
