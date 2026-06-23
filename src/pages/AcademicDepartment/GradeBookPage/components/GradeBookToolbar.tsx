import React from 'react';
import {
    Save,
    FileDown,
    Loader2,
    Calendar,
    Users,
    CheckSquare,
    Star,
    FileText,
    Trash2
} from 'lucide-react';
import { useSidebar } from "../../../../SidebarContext";
import { useNavigate } from 'react-router-dom';

interface GradeBookToolbarProps {
    selectedCourse: string;
    completenessStats: any;
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
    setActiveTab: (tab: 'grades' | 'characteristics' | 'readingWriting') => void;
    academicSettings: any;
    academicYear?: string;
    selectedClass: string;
    selectedRoom: string;
    selectedGroup: string;
    selectedSemester: string;
    isPdfValidating: boolean;
    handleCreatePdf: () => void;
    isSaving: boolean;
    handleSave: () => void;
    handleClearScores: () => void;
}

const GradeBookToolbar: React.FC<GradeBookToolbarProps> = ({
    selectedCourse,
    completenessStats,
    activeTab,
    setActiveTab,
    academicYear,
    selectedClass,
    selectedRoom,
    selectedGroup,
    selectedSemester,
    isPdfValidating,
    handleCreatePdf,
    isSaving,
    handleSave,
    handleClearScores,
}) => {
    const { isCollapsed } = useSidebar();
    const navigate = useNavigate();
    if (!selectedCourse) return null;

    const tabs: { id: 'grades' | 'characteristics' | 'readingWriting'; label: string; icon: any }[] = [
        { id: 'grades', label: 'คะแนน', icon: CheckSquare },
        { id: 'characteristics', label: 'คุณลักษณะ', icon: Star },
        { id: 'readingWriting', label: 'อ่าน/เขียน', icon: FileText },
    ];

    const progress = completenessStats?.percentage || 0;
    const totalCount = completenessStats?.total || 0;
    const filledCount = completenessStats?.filled || 0;
    const canDownloadPdf = Boolean(completenessStats?.isReadyForPdf) && !isPdfValidating;

    const handleNavigateToHistory = () => {
        const params = new URLSearchParams();
        if (academicYear) params.set('year', academicYear);
        if (selectedSemester && selectedSemester !== 'annual') params.set('semester', selectedSemester);
        if (selectedClass) params.set('classId', selectedClass);
        
        // Extract room number from selectedGroup (e.g. "กลุ่ม 1" -> "1")
        let roomNum = selectedRoom;
        if (selectedGroup && selectedGroup.includes('กลุ่ม')) {
            roomNum = selectedGroup.replace('กลุ่ม', '').trim();
        } else if (selectedGroup) {
            roomNum = selectedGroup;
        }
        
        if (roomNum) params.set('roomNumber', roomNum);
        if (selectedCourse) params.set('courseId', selectedCourse);
        
        navigate(`/academic/classroom-attendance-history?${params.toString()}`);
    };

    return (
        <div className="flex items-center gap-3 mb-6 bg-white/80 dark:bg-[#1a1b1e]/90 p-3 rounded-2xl border border-gray-100/50 dark:border-gray-800 backdrop-blur-xl sticky top-16 z-50 shadow-2xl shadow-gray-200/50 dark:shadow-none ring-1 ring-black/5 dark:ring-white/5 transition-all duration-300">
            
            {/* Progress Segment */}
            <div className="flex-shrink-0 flex items-center gap-3 pr-3 border-r border-gray-200 dark:border-gray-800">
                <div className="relative w-10 h-10 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90">
                        <circle
                            cx="20" cy="20" r="17"
                            stroke="currentColor" strokeWidth="3.5" fill="transparent"
                            className="text-gray-100 dark:text-gray-800"
                        />
                        <circle
                            cx="20" cy="20" r="17"
                            stroke="currentColor" strokeWidth="3.5" fill="transparent"
                            strokeDasharray={106.8}
                            strokeDashoffset={106.8 - (106.8 * progress) / 100}
                            className="text-indigo-600 dark:text-indigo-500 transition-all duration-700 ease-out"
                            strokeLinecap="round"
                        />
                    </svg>
                    <span className="absolute text-[9px] font-black text-gray-900 dark:text-white">{Math.round(progress)}%</span>
                </div>
                <div className={`hidden ${isCollapsed ? 'xl:flex' : 'hidden'} flex-col`}>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-tighter leading-none">ความคืบหน้า</span>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-white mt-1">{filledCount}/{totalCount}</span>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex items-center justify-between gap-4 flex-grow overflow-x-auto no-scrollbar">
                {/* Tabs */}
                <div className="flex p-1 bg-gray-100/50 dark:bg-gray-900/50 rounded-xl border border-gray-200/50 dark:border-gray-800/50">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${activeTab === tab.id
                                ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-gray-100 dark:border-gray-700'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            <tab.icon size={14} />
                            {(isCollapsed || !window.matchMedia('(min-width: 1024px)').matches) && <span>{tab.label}</span>}
                        </button>
                    ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {/* Status Info */}
                    <div className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100/50 dark:border-indigo-800/30 ${isCollapsed ? 'flex' : 'hidden md:flex'}`}>
                        <Users size={12} />
                        <span className="text-[10px] font-black whitespace-nowrap">
                            {isCollapsed ? `เช็คแล้ว : ${completenessStats?.recordedDaysCount || 0} คาบ` : `${completenessStats?.recordedDaysCount || 0}`}
                        </span>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-1.5 p-1 bg-gray-100/30 dark:bg-gray-900/30 rounded-xl border border-gray-200/20 dark:border-gray-800/20">
                        <button
                            onClick={handleNavigateToHistory}
                            title="เช็คชื่อย้อนหลัง"
                            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-all border border-gray-100 dark:border-gray-700"
                        >
                            <Calendar size={14} />
                            {isCollapsed && <span className="text-[10px] font-black hidden lg:inline">เช็คชื่อย้อนหลัง</span>}
                        </button>
                        
                        <button
                            onClick={handleCreatePdf}
                            disabled={!canDownloadPdf}
                            title={canDownloadPdf ? 'ดาวน์โหลด PDF' : 'ต้องกรอกคะแนน คุณลักษณะ อ่าน/คิด/เขียน และเช็คชื่อให้ครบ 100% ก่อน'}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all border ${
                                canDownloadPdf
                                    ? 'bg-white dark:bg-gray-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 border-gray-100 dark:border-gray-700'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 border-gray-200 dark:border-gray-700 cursor-not-allowed opacity-70'
                            }`}
                        >
                            {isPdfValidating ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
                            {isCollapsed && <span className="text-[10px] font-black hidden lg:inline">ดาวน์โหลด PDF</span>}
                            {!isCollapsed && <span className="text-[10px] font-black sm:inline hidden">PDF</span>}
                        </button>

                        <button
                            onClick={handleClearScores}
                            title="ล้างคะแนนทั้งหมด"
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all border border-gray-100 dark:border-gray-700"
                        >
                            <Trash2 size={14} />
                            {isCollapsed && <span className="text-[10px] font-black hidden lg:inline">ล้าง</span>}
                        </button>

                        <div className="w-px h-6 bg-gray-200 dark:bg-gray-800 mx-1" />

                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                            <span className={`text-[11px] font-black whitespace-nowrap ${isCollapsed ? 'hidden sm:inline' : 'hidden'}`}>บันทึกข้อมูลหน้าปัจจุบัน</span>
                            {!isCollapsed && <span className="text-[11px] font-black whitespace-nowrap">บันทึก</span>}
                            {isCollapsed && <span className="text-[11px] font-black whitespace-nowrap sm:hidden">บันทึก</span>}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GradeBookToolbar;
