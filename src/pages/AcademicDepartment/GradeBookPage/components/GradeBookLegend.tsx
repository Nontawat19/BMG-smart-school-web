import React from 'react';
import { Star, FileText } from 'lucide-react';

interface GradeBookLegendProps {
    selectedCourse: string;
    scoreDistribution: Record<number, number> | null;
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
}

const GradeBookLegend: React.FC<GradeBookLegendProps> = ({
    selectedCourse,
    scoreDistribution,
    activeTab
}) => {
    if (!selectedCourse) return null;

    const isGradeTab = activeTab === 'grades';

    return (
        <>
            <div className="mt-4 flex flex-wrap gap-6 text-xs text-gray-500 dark:text-gray-400 bg-white dark:bg-[#2a2b2f] p-4 rounded-xl border border-gray-100 dark:border-gray-700">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-indigo-600 uppercase tracking-wider">เกณฑ์การประเมิน:</span> 3 = ดีเยี่ยม, 2 = ดี, 1 = ผ่าน, 0 = ปรับปรุง
                </div>
                {!isGradeTab && (
                    <>
                        <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400">
                            <Star size={14} /> คุณลักษณะที่พึงประสงค์
                        </div>
                        <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                            <FileText size={14} /> การอ่าน คิดวิเคราะห์ และเขียน
                        </div>
                    </>
                )}
                {isGradeTab && (
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-blue-600 uppercase tracking-wider">ระบบเกรด:</span> ตัดเกรดอัตโนมัติ 0 - 4 และ ร/มส
                    </div>
                )}
            </div>

            {!isGradeTab && scoreDistribution && (
                <div className="mt-4 flex flex-wrap items-center gap-4 bg-white dark:bg-[#2a2b2f] p-4 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <span className="text-sm font-bold text-gray-500 uppercase tracking-wider">สรุปผลการประเมิน:</span>
                    <div className="flex flex-wrap gap-6">
                        {[3, 2, 1, 0].map(v => (
                            <div key={v} className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full ${v === 3 ? 'bg-emerald-500' : v === 2 ? 'bg-yellow-500' : v === 1 ? 'bg-blue-500' : 'bg-red-500'}`}></div>
                                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">{v === 3 ? 'ดีเยี่ยม' : v === 2 ? 'ดี' : v === 1 ? 'ผ่าน' : 'ปรับปรุง'}:</span>
                                <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">{scoreDistribution[v] || 0} คน</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </>
    );
};

export default GradeBookLegend;
