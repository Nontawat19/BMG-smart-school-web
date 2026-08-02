import React from 'react';
import {
    Student,
    GradeRecord,
    CharacteristicCriteria,
    ReadingWritingCriteria
} from '../types';
import { isSDQCharacteristic } from '../sdqCriteria';

interface GradeBookTableProps {
    activeTab: 'grades' | 'characteristics' | 'readingWriting';
    filteredStudents: Student[];
    grades: Record<string, GradeRecord>;
    characteristicsCriteria: CharacteristicCriteria[];
    readingWritingCriteria: ReadingWritingCriteria[];
    maxScores: { formative: number; midterm: number; final: number };
    selectedClass: string;
    selectedCourse: string;
    sdqMap: Record<string, any>;
    formatPrefix: (prefix?: string) => string;
    handleScoreChange: (studentId: string, field: string, value: string, criteriaId?: string) => void;
    handleBulkFillColumn: (value: string, key: string, isCharOrRW?: boolean, criteriaId?: string) => void;
    handleSyncSDQColumn: (criteriaTitle: string, criteriaId: string) => void;
    getOverallQuality: (studentId: string) => number | string | null;
}

const GradeBookTable: React.FC<GradeBookTableProps> = ({
    activeTab,
    filteredStudents,
    grades,
    characteristicsCriteria,
    readingWritingCriteria,
    maxScores,
    selectedClass,
    selectedCourse,
    sdqMap,
    formatPrefix,
    handleScoreChange,
    handleBulkFillColumn,
    handleSyncSDQColumn,
    getOverallQuality
}) => {

    const isCharacteristics = activeTab === 'characteristics';
    const isRW = activeTab === 'readingWriting';
    const hasSDQData = Object.keys(sdqMap || {}).length > 0;
    const scoreInputClass = "w-16 h-9 text-center bg-slate-900/5 dark:bg-slate-800 border rounded-xl text-sm font-black focus:ring-2 outline-none transition-all shadow-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none";

    return (
        <div className={`overflow-x-auto ${(isCharacteristics || isRW) ? 'scrollbar-hide' : ''}`}>
            <table className={`w-full text-left border-collapse ${(isCharacteristics || isRW) ? 'table-fixed' : 'table-auto'}`} style={(isCharacteristics || isRW) ? { minWidth: 'fit-content' } : {}}>
                <thead>
                    {activeTab === 'characteristics' ? (
                        <>
                            {/* Header Row 1: Titles - Adaptive Theme */}
                            <tr className="bg-slate-700 dark:bg-slate-900 border-b border-slate-800 dark:border-slate-950 transition-colors">
                                <th className="px-1 py-3 w-10 sticky left-0 bg-slate-700 dark:bg-slate-900 z-30 text-[10px] text-white/80 dark:text-gray-300 text-center font-bold">เลขที่</th>
                                <th className="px-4 py-3 w-48 sticky left-10 bg-slate-700 dark:bg-slate-900 z-30 text-[11px] text-white dark:text-gray-300 font-bold border-r border-slate-600/30 dark:border-slate-800">ชื่อ-นามสกุล</th>
                                {characteristicsCriteria.map((c, cIdx) => {
                                    const isSDQ = isSDQCharacteristic(c.id, c.title);
                                    return (
                                        <th
                                            key={`char_title_${c.id}`}
                                            colSpan={c.indicators?.length || 1}
                                            className="px-0.5 py-2 text-[10px] font-black text-white border-r border-slate-600/30 dark:border-slate-800 text-center relative"
                                        >
                                            <div className="flex flex-col items-center gap-1">
                                                <div className="flex items-center gap-1 relative">
                                                    {isSDQ && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSyncSDQColumn(c.title, c.id)}
                                                            disabled={!hasSDQData}
                                                            title={hasSDQData ? `นำคะแนน SDQ มาใส่ในคอลัมน์ "${c.title}"` : 'ยังไม่มีข้อมูล SDQ สำหรับนักเรียนกลุ่มนี้'}
                                                            className={`absolute -left-8 top-0 text-white text-[8px] px-1.5 py-0.5 rounded-full font-black shadow-lg transition-transform ${hasSDQData ? 'bg-[#22c55e] hover:scale-110 cursor-pointer' : 'bg-gray-400 cursor-not-allowed opacity-60'}`}
                                                        >
                                                            SDQ
                                                        </button>
                                                    )}
                                                    <span className="whitespace-nowrap">{cIdx + 1}. {c.title.split(' ')[0]}</span>
                                                </div>
                                                <div className="flex gap-1 mt-1">
                                                    {(c.indicators || []).map((_, iIdx) => (
                                                        <div key={`box_${c.id}_${iIdx}`} className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${isSDQ ? 'bg-indigo-400 dark:bg-indigo-600/50 border border-indigo-200 dark:border-indigo-400/50' : 'bg-slate-600 dark:bg-slate-800'}`}>
                                                            {iIdx + 1}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="px-2 py-3 w-12 sticky right-0 z-30 bg-slate-700 dark:bg-slate-900 text-[10px] text-white text-center font-bold">สรุป</th>
                            </tr>
                            
                            {/* Bulk Input Row - Characteristics */}
                            <tr className="bg-gray-50 dark:bg-[#1a1b1e] border-b border-gray-200 dark:border-gray-800">
                                <td className="px-1 py-1 sticky left-0 bg-gray-50 dark:bg-[#1a1b1e] z-20"></td>
                                <td className="px-4 py-1 sticky left-10 bg-gray-50 dark:bg-[#1a1b1e] z-20 border-r border-gray-200 dark:border-gray-800 text-[9px] text-indigo-600 dark:text-indigo-400 font-black text-right uppercase tracking-tighter">
                                    กรอกยกคอลัมน์
                                </td>
                                {characteristicsCriteria.flatMap((c) =>
                                    (c.indicators || []).map((_, iIdx) => {
                                        const isSDQ = isSDQCharacteristic(c.id, c.title);
                                        return (
                                            <td key={`bulk_${c.id}_${iIdx}`} className={`px-0.5 py-1 text-center border-r border-gray-100 dark:border-gray-800/50 ${isSDQ ? 'bg-indigo-50 dark:bg-indigo-900/10' : ''}`}>
                                                <input
                                                    type="text"
                                                    maxLength={1}
                                                    className={`w-6 h-6 text-center rounded text-[10px] font-bold outline-none transition-all ${isSDQ 
                                                        ? 'bg-indigo-50 dark:bg-[#2a2b2f] border-indigo-300 dark:border-indigo-500 text-indigo-600 dark:text-indigo-300' 
                                                        : 'bg-white dark:bg-[#2a2b2f] border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'}`}
                                                    placeholder="-"
                                                    onChange={(e) => handleBulkFillColumn(e.target.value, `${c.id}_${iIdx}`, true, `${c.id}_${iIdx}`)}
                                                />
                                            </td>
                                        );
                                    })
                                )}
                                <td className="px-2 py-1 bg-gray-50 dark:bg-[#1a1b1e] sticky right-0 z-20"></td>
                            </tr>
                        </>
                    ) : activeTab === 'readingWriting' ? (
                        <>
                            {/* Reading/Writing Header - Adaptive */}
                            <tr className="bg-amber-600 dark:bg-amber-900/40 border-b border-amber-700 dark:border-amber-800">
                                <th className="px-1 py-3 w-10 sticky left-0 bg-amber-600 dark:bg-amber-900/30 z-30 text-[10px] text-white/80 dark:text-gray-300 text-center font-bold">เลขที่</th>
                                <th className="px-4 py-3 w-48 sticky left-10 bg-amber-600 dark:bg-amber-900/30 z-30 text-[11px] text-white dark:text-gray-300 font-bold border-r border-amber-500/30">ชื่อ-นามสกุล</th>
                                {readingWritingCriteria.map((c, cIdx) => (
                                    <th key={`std_${c.id}`} colSpan={c.indicators?.length || 1} className="px-2 py-2 text-[11px] font-black text-white dark:text-amber-300 border-r border-amber-500/30 text-center relative group/th">
                                        <div className="flex flex-col items-center gap-1">
                                            <span>ข้อ {cIdx + 1}</span>
                                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-white cursor-help font-bold text-[10px]">!</div>
                                        </div>
                                        
                                        {/* Tooltip for RW */}
                                        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-80 p-5 bg-[#0d0d0d] text-white rounded-2xl shadow-2xl border border-gray-800 z-[100] opacity-0 pointer-events-none group-hover/th:opacity-100 transition-opacity text-left">
                                            <div className="text-amber-500 font-black text-sm mb-2">{cIdx + 1}.1 {c.standard}</div>
                                            <div className="text-xs font-bold text-gray-100 mb-4">{(c.indicators || [])[0]?.text}</div>
                                            <hr className="border-gray-800 mb-4" />
                                            <div className="space-y-3 text-[11px]">
                                                {Object.entries((c.indicators || [])[0]?.rubric || {}).reverse().map(([key, val]) => (
                                                    <div key={key} className="flex gap-3"><span className="text-gray-400 font-bold whitespace-nowrap">{key} : {key === '3' ? 'ดีเยี่ยม' : key === '2' ? 'ดี' : key === '1' ? 'ผ่าน' : 'ปรับปรุง'}</span><span className={`${key === '3' ? 'text-emerald-400' : key === '2' ? 'text-amber-400' : key === '1' ? 'text-blue-400' : 'text-red-400'}`}>{val}</span></div>
                                                ))}
                                            </div>
                                        </div>
                                    </th>
                                ))}
                                <th className="px-4 py-2 sticky right-0 z-30 bg-amber-600 dark:bg-amber-900/30 text-white text-[10px] font-bold text-center">เฉลี่ย</th>
                            </tr>
                            
                            {/* Bulk Input Row - Reading/Writing */}
                            <tr className="bg-amber-50 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/50">
                                <td className="px-1 py-1 sticky left-0 bg-amber-50 dark:bg-amber-950/20 z-20"></td>
                                <td className="px-4 py-1 sticky left-10 bg-amber-50 dark:bg-amber-950/20 z-20 border-r border-amber-100 dark:border-amber-900 text-[9px] text-amber-700 dark:text-amber-400 font-black text-right uppercase tracking-tighter">
                                    กรอกยกคอลัมน์
                                </td>
                                {readingWritingCriteria.flatMap((c) =>
                                    (c.indicators || []).map((_, iIdx) => (
                                        <td key={`bulk_rw_${c.id}_${iIdx}`} className="px-0.5 py-1 text-center border-r border-amber-100 dark:border-amber-900/30">
                                            <input
                                                type="text"
                                                maxLength={1}
                                                className="w-6 h-6 text-center bg-white dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded text-[10px] font-bold text-amber-700 dark:text-amber-300 outline-none focus:border-amber-500"
                                                placeholder="-"
                                                onChange={(e) => handleBulkFillColumn(e.target.value, `${c.id}_${iIdx}`, true, `${c.id}_${iIdx}`)}
                                            />
                                        </td>
                                    ))
                                )}
                                <td className="px-2 py-1 bg-amber-50 dark:bg-amber-950/20 sticky right-0 z-20"></td>
                            </tr>
                        </>
                    ) : (
                        /* Grades Tab Header - Adaptive */
                        <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-sm">
                            <th className="px-1 py-3 font-bold text-[10px] w-10 sticky left-0 bg-slate-50 dark:bg-slate-900 z-20 border-r dark:border-slate-800 text-center uppercase tracking-tighter text-slate-500">เลขที่</th>
                            <th className="px-1 py-3 font-bold text-[10px] w-16 sticky left-10 bg-slate-50 dark:bg-slate-900 z-20 border-r dark:border-slate-800 text-center uppercase tracking-tighter text-slate-500">รหัส</th>
                            <th className="px-4 py-3 font-bold text-[11px] min-w-[180px] sticky left-[104px] bg-slate-50 dark:bg-slate-900 z-20 border-r dark:border-slate-800 text-slate-700 dark:text-slate-300">ชื่อ-นามสกุล</th>
                            <th className="px-3 py-3 text-center font-bold text-blue-600 dark:text-blue-400 border-r dark:border-slate-800 text-[11px]">คะแนนเก็บ ({maxScores.formative})</th>
                            <th className="px-3 py-3 text-center font-bold text-orange-600 dark:text-orange-400 border-r dark:border-slate-800 text-[11px]">กลางภาค ({maxScores.midterm})</th>
                            <th className="px-3 py-3 text-center font-bold text-emerald-600 dark:text-emerald-400 border-r dark:border-slate-800 text-[11px]">ปลายภาค ({maxScores.final})</th>
                            <th className="px-3 py-3 text-center font-black text-indigo-600 dark:text-indigo-400 border-r dark:border-slate-800 text-[11px]">รวม</th>
                            <th className="px-6 py-3 text-center font-bold text-slate-700 dark:text-slate-300 sticky right-0 z-20 bg-slate-50 dark:bg-slate-900 shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.1)] text-[11px]">เกรด / ผลการเรียน</th>
                        </tr>
                    )}
                </thead>
                <tbody className={`divide-y ${(isCharacteristics || isRW) ? 'divide-gray-100 dark:divide-gray-800 bg-white dark:bg-[#0d0d0d]' : 'divide-gray-100 dark:divide-gray-800'}`}>
                    {filteredStudents.map((student) => {
                        const record = grades[student.id] || { formative: 0, midterm: 0, final: 0, total: 0, grade: '0' };
                        return (
                            <tr key={student.id} className={(isCharacteristics || isRW) ? 'hover:bg-gray-50 dark:hover:bg-[#1a1b1e] transition-colors group' : 'hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors group'}>
                                <td className={`px-1 py-3 text-center sticky left-0 z-10 border-r ${(isCharacteristics || isRW) ? 'bg-white dark:bg-[#0d0d0d] border-gray-100 dark:border-gray-800' : 'bg-white dark:bg-[#1a1b1e] dark:border-gray-800'}`}>
                                    <span className={`font-black text-[10px] sm:text-[11px] ${(isCharacteristics || isRW) ? 'text-gray-400 dark:text-gray-500' : 'text-slate-500 dark:text-slate-400'}`}>{student.studentNumber}</span>
                                </td>
                                { !(isCharacteristics || isRW) && (
                                    <td className="px-1 py-3 font-mono text-slate-400 sticky left-10 bg-white dark:bg-[#1a1b1e] group-hover:bg-slate-50/50 dark:group-hover:bg-white/5 z-10 text-center w-16 border-r dark:border-gray-800">
                                        <span className="text-[9px] font-bold">{student.studentId}</span>
                                    </td>
                                )}
                                <td className={`px-4 py-3 sticky z-10 border-r ${(isCharacteristics || isRW) ? 'bg-white dark:bg-[#0d0d0d] border-gray-100 dark:border-gray-800 left-10 w-48' : 'bg-white dark:bg-[#1a1b1e] dark:border-gray-800 left-[104px]'}`}>
                                    <div className={`font-bold whitespace-nowrap text-[11px] ${(isCharacteristics || isRW) ? 'text-gray-600 dark:text-gray-400' : 'text-slate-700 dark:text-slate-200'}`}>
                                        {formatPrefix(student.title)}{student.firstName} {student.lastName}
                                    </div>
                                </td>
                                
                                {activeTab === 'characteristics' ? (
                                    <>
                                        {characteristicsCriteria.flatMap(c =>
                                            (c.indicators || []).map((_, iIdx) => {
                                                const scoreKey = `${c.id}_${iIdx}`;
                                                const isSDQ = isSDQCharacteristic(c.id, c.title);
                                                return (
                                                    <td key={scoreKey} className={`px-0.5 py-2 border-r border-gray-100 dark:border-gray-800/30 text-center ${isSDQ ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                                                        <input
                                                            type="text"
                                                            maxLength={1}
                                                            value={record.characteristicsScores?.[scoreKey] !== undefined ? record.characteristicsScores[scoreKey] : ''}
                                                            onChange={(e) => handleScoreChange(student.id, 'characteristics', e.target.value, scoreKey)}
                                                            className={`w-7 h-7 mx-auto block text-center rounded text-xs font-bold outline-none transition-all ${isSDQ 
                                                                ? 'bg-indigo-50 dark:bg-[#1a1b1e] border-indigo-200 dark:border-indigo-500/50 text-indigo-600 dark:text-indigo-300 shadow-[0_0_10px_rgba(99,102,241,0.05)]' 
                                                                : 'bg-white dark:bg-[#1a1b1e] border-gray-200 dark:border-gray-800 text-gray-700 dark:text-white'}`}
                                                            placeholder="-"
                                                        />
                                                    </td>
                                                );
                                            })
                                        )}
                                        <td className="px-2 py-4 text-center sticky right-0 z-10 bg-white dark:bg-[#0d0d0d] border-l border-gray-100 dark:border-gray-800">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black">
                                                {getOverallQuality(student.id)}
                                            </span>
                                        </td>
                                    </>
                                ) : activeTab === 'readingWriting' ? (
                                    <>
                                        {readingWritingCriteria.flatMap(c => (c.indicators || []).map((_, iIdx) => {
                                            const scoreKey = `${c.id}_${iIdx}`;
                                            return (
                                                <td key={scoreKey} className="px-0.5 py-2 border-r border-gray-100 dark:border-gray-800/30 text-center">
                                                    <input
                                                        type="text"
                                                        maxLength={1}
                                                        value={record.readingWritingScores?.[scoreKey] !== undefined ? record.readingWritingScores[scoreKey] : ''}
                                                        onChange={(e) => handleScoreChange(student.id, 'readingWriting', e.target.value, scoreKey)}
                                                        className="w-7 h-7 mx-auto block text-center bg-white dark:bg-[#1a1b1e] border border-amber-200 dark:border-amber-800/50 rounded text-xs font-bold text-amber-700 dark:text-amber-400 focus:border-amber-500 outline-none transition-all"
                                                        placeholder="-"
                                                    />
                                                </td>
                                            );
                                        }))}
                                        <td className="px-2 py-4 text-center sticky right-0 z-10 bg-white dark:bg-[#0d0d0d] border-l border-gray-100 dark:border-gray-800">
                                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 text-[10px] font-black">
                                                {(() => { const scores = Object.values(record.readingWritingScores || {}); if (scores.length === 0) return '-'; const avg = scores.reduce((a, b) => a + b, 0) / scores.length; return Math.round(avg); })()}
                                            </span>
                                        </td>
                                    </>
                                ) : (
                                    /* Grades Body - Optimized Compact UI */
                                    <>
                                        <td className="px-2 py-3 bg-blue-50/50 dark:bg-blue-900/5 text-center border-r border-blue-100/50 dark:border-slate-800">
                                            <input 
                                                type="text"
                                                inputMode="decimal"
                                                value={record.formative || 0} 
                                                onFocus={(e) => e.currentTarget.select()}
                                                onChange={(e) => handleScoreChange(student.id, 'formative', e.target.value)} 
                                                title="แก้คะแนนเก็บรวม ระบบจะเกลี่ยลงหัวข้อย่อยอัตโนมัติ"
                                                className={`${scoreInputClass} border-blue-200 dark:border-blue-500/30 focus:ring-blue-500/50 text-blue-600 dark:text-blue-400`} 
                                            />
                                        </td>
                                        <td className="px-2 py-3 bg-orange-50/50 dark:bg-orange-900/5 text-center border-r border-orange-100/50 dark:border-slate-800">
                                            <input 
                                                type="text"
                                                inputMode="decimal"
                                                value={record.midterm || 0} 
                                                onFocus={(e) => e.currentTarget.select()}
                                                onChange={(e) => handleScoreChange(student.id, 'midterm', e.target.value)} 
                                                className={`${scoreInputClass} border-orange-200 dark:border-orange-500/30 focus:ring-orange-500/50 text-orange-600 dark:text-orange-400`} 
                                            />
                                        </td>
                                        <td className="px-2 py-3 bg-emerald-50/50 dark:bg-emerald-900/5 text-center border-r border-emerald-100/50 dark:border-slate-800">
                                            <input 
                                                type="text"
                                                inputMode="decimal"
                                                value={record.final || 0} 
                                                onFocus={(e) => e.currentTarget.select()}
                                                onChange={(e) => handleScoreChange(student.id, 'final', e.target.value)} 
                                                className={`${scoreInputClass} border-emerald-200 dark:border-emerald-500/30 focus:ring-emerald-500/50 text-emerald-600 dark:text-emerald-400`} 
                                            />
                                        </td>
                                        <td className="px-2 py-3 text-center border-r dark:border-slate-800">
                                            <span className={`text-sm font-black tracking-tight ${record.total >= 50 ? 'text-indigo-600 dark:text-indigo-400' : 'text-red-500'}`}>
                                                {record.total}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-center sticky right-0 bg-white dark:bg-[#1a1b1e] z-10 border-l border-slate-200 dark:border-slate-800 shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.05)]">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-black text-white shadow-md transition-all ${record.status === 'มส' || record.status === '0' || record.grade === '0' ? 'bg-rose-500' : record.status === 'ร' ? 'bg-amber-500' : record.grade === '4' ? 'bg-emerald-500' : 'bg-indigo-500'}`}>
                                                    {record.status || record.grade}
                                                </div>
                                                
                                                <div className="flex gap-0.5">
                                                    {['0', 'ร', 'มส'].map((s) => (
                                                        <button
                                                            key={s}
                                                            onClick={() => handleScoreChange(student.id, 'status', record.status === s ? '' : s)}
                                                            className={`w-5 h-5 rounded-md text-[9px] font-black transition-all border ${
                                                                record.status === s 
                                                                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white scale-105' 
                                                                : 'bg-slate-50 dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                                            }`}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </td>
                                    </>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default GradeBookTable;
