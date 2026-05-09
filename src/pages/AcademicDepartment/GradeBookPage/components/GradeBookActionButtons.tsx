import React from 'react';
import { Copy, RefreshCw, Trash2 } from 'lucide-react';

interface GradeBookActionButtonsProps {
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
    selectedCourse: string;
    handleImportFromOtherCourse: () => void;
    handleSyncSDQ: () => void;
    handleBulkFill: (value: number) => void;
    handleClearScores: () => void;
}

const GradeBookActionButtons: React.FC<GradeBookActionButtonsProps> = ({
    activeTab,
    selectedCourse,
    handleImportFromOtherCourse,
    handleSyncSDQ,
    handleBulkFill,
    handleClearScores,
}) => {
    if (!selectedCourse) return null;

    const isGradesTab = activeTab === 'grades';

    return (
        <div className="flex flex-wrap items-center justify-end gap-3 mb-4 px-4 sm:px-0 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex items-center gap-2">
                {!isGradesTab && (
                    <button
                        onClick={handleImportFromOtherCourse}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 text-xs font-bold transition-all border border-indigo-100 dark:border-indigo-800/30 shadow-sm"
                    >
                        <Copy size={14} /> นำเข้า
                    </button>
                )}

                {!isGradesTab && (
                    <button
                        onClick={handleSyncSDQ}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-50 dark:bg-teal-900/20 text-teal-600 dark:text-teal-400 hover:bg-teal-100 text-xs font-bold transition-all border border-teal-100 dark:border-teal-800/30 shadow-sm"
                        title="นำคะแนนจาก SDQ มาใส่โดยอัตโนมัติ"
                    >
                        <RefreshCw size={14} /> นำจาก SDQ
                    </button>
                )}
            </div>

            {!isGradesTab && (
                <>
                    <div className="flex items-center gap-2.5 bg-white/[0.03] dark:bg-gray-800/40 p-1 pl-3 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                        <span className="text-[11px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-tight">เติมระดับอัตโนมัติ:</span>
                        <div className="flex items-center gap-1">
                            {[3, 2, 1].map(v => (
                                <button
                                    key={v}
                                    onClick={() => handleBulkFill(v)}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700 text-[12px] font-black text-gray-600 dark:text-gray-300 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 transition-all shadow-sm border border-gray-100 dark:border-gray-600 active:scale-90"
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            <button
                onClick={handleClearScores}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 text-xs font-bold transition-all border border-red-100 dark:border-red-800/30 shadow-sm"
            >
                <Trash2 size={14} /> ล้าง{isGradesTab ? 'คะแนนทั้งหมด' : 'ระดับการประเมิน'}
            </button>
        </div>
    );
};

export default GradeBookActionButtons;
