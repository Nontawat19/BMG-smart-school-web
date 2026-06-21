import React, { useState } from 'react';
import { Link } from "react-router-dom";
import { FaLock, FaRunning } from "react-icons/fa";
import { LayoutList, LayoutGrid } from 'lucide-react';
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { useResponsivePwaMode as usePwaMode } from "@/hooks/useResponsivePwaMode";
import { Student } from '../../types';
import { StudentCardSkeleton } from '../Skeletons';

interface StudentGridProps {
    students: Student[];
    attendance: Record<string, string>;
    studentLeaves: Record<string, boolean>;
    isSubmitted: boolean;
    isHoliday: boolean;
    loading: boolean;
    schoolId: string;
    onToggleStatus: (studentId: string, status: 'present' | 'absent' | 'late' | 'leave' | 'escape') => void;
}

const StudentGrid: React.FC<StudentGridProps> = ({
    students,
    attendance,
    studentLeaves,
    isSubmitted,
    isHoliday,
    loading,
    schoolId,
    onToggleStatus,
}) => {
    const isPwaMode = usePwaMode();
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    const getStatusStyle = (status?: string) => {
        switch (status) {
            case 'present': return 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/5';
            case 'late': return 'border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/5';
            case 'leave': return 'border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/5';
            case 'escape': return 'border-orange-200 dark:border-orange-900 bg-orange-50/30 dark:bg-orange-900/5';
            case 'absent': return 'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5';
            default: return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]';
        }
    };

    const statusOptions = [
        { status: 'present', label: 'มา', colorClass: 'text-green-600 dark:text-green-400', bgClass: 'bg-green-100 dark:bg-green-900/30', activeClass: 'bg-white dark:bg-gray-700 text-green-600 shadow-sm ring-1 ring-green-200' },
        { status: 'late', label: 'สาย', colorClass: 'text-yellow-600 dark:text-yellow-400', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', activeClass: 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm ring-1 ring-yellow-200' },
        { status: 'leave', label: 'ลา', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-900/30', activeClass: 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm ring-1 ring-blue-200' },
        { status: 'escape', label: 'หนีเรียน', colorClass: 'text-orange-600 dark:text-orange-400', bgClass: 'bg-orange-100 dark:bg-orange-900/30', activeClass: 'bg-white dark:bg-gray-700 text-orange-600 shadow-sm ring-1 ring-orange-200' },
        { status: 'absent', label: 'ขาด', colorClass: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-100 dark:bg-red-900/30', activeClass: 'bg-white dark:bg-gray-700 text-red-600 shadow-sm ring-1 ring-red-200' },
    ];

    if (loading) {
        return (
            <div className={isPwaMode ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"}>
                {[...Array(8)].map((_, i) => <StudentCardSkeleton key={i} />)}
            </div>
        );
    }

    if (students.length === 0) {
        return (
            <div className="col-span-full text-center py-10 text-gray-500 bg-white dark:bg-[#2a2b2f] rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                ไม่พบรายชื่อนักเรียนในชั้นนี้
            </div>
        );
    }

    const renderStatusButtons = (student: Student, compact = false) => (
        <>
            <div className={`grid grid-cols-4 ${compact ? 'gap-1' : 'gap-1.5'}`}>
                {statusOptions.filter(opt => opt.status !== 'escape').map(opt => (
                    <button
                        key={opt.status}
                        onClick={() => onToggleStatus(student.id, opt.status as any)}
                        disabled={isSubmitted || isHoliday || studentLeaves[student.id]}
                        className={`
                            flex min-w-0 items-center justify-center rounded-xl font-bold transition-all duration-200
                            ${compact ? 'py-1.5 text-[11px]' : 'py-2 text-xs'}
                            ${attendance[student.id] === opt.status
                                ? `${opt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] transform scale-105 shadow-md`
                                : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                            }
                            ${(isSubmitted || isHoliday || studentLeaves[student.id]) ? 'cursor-not-allowed opacity-60' : ''}
                        `}
                    >
                        <span className="truncate">{opt.label}</span>
                    </button>
                ))}
            </div>
            {statusOptions.filter(opt => opt.status === 'escape').map(opt => (
                <button
                    key={opt.status}
                    onClick={() => onToggleStatus(student.id, opt.status as any)}
                    disabled={isSubmitted || isHoliday || studentLeaves[student.id]}
                    className={`
                        w-full flex min-w-0 items-center justify-center rounded-xl font-bold transition-all duration-200 gap-1.5
                        ${compact ? 'py-1 text-[11px] mt-1' : 'py-1.5 text-xs mt-1.5'}
                        ${attendance[student.id] === opt.status
                            ? `${opt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] shadow-md`
                            : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                        }
                        ${(isSubmitted || isHoliday || studentLeaves[student.id]) ? 'cursor-not-allowed opacity-60' : ''}
                    `}
                >
                    <FaRunning className="text-xs shrink-0" />
                    <span className="truncate">{opt.label}</span>
                </button>
            ))}
        </>
    );

    return (
        <div className="space-y-3">
            {/* View toggle — desktop only */}
            {!isPwaMode && (
                <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-gray-500 dark:text-gray-400">
                        รายชื่อนักเรียน ({students.length} คน)
                    </p>
                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/5 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                            title="มุมมองรายการ"
                        >
                            <LayoutList size={16} />
                        </button>
                        <button
                            onClick={() => setViewMode('grid')}
                            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-indigo-600 text-indigo-600 dark:text-white shadow-sm' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'}`}
                            title="มุมมองกริด"
                        >
                            <LayoutGrid size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* List view — desktop horizontal rows */}
            {!isPwaMode && viewMode === 'list' && (
                <div className="flex flex-col gap-2">
                    {students.map((student) => {
                        const fullName = `${student.firstName} ${student.lastName || ''}`.trim();
                        const cleanName = fullName.replace(/^(พระสามเณร|พระมหา|พระครู|พระใบฎีกา|หลวงพ่อ|พระอาจารย์|พระ|สามเณร|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นาย|นางสาว|นาง)\s*/, '').trim();
                        return (
                            <div
                                key={student.id}
                                className={`relative group rounded-xl border-2 transition-all duration-300 hover:shadow-md overflow-hidden px-4 py-2.5 flex items-center gap-4 ${getStatusStyle(attendance[student.id])}`}
                            >
                                {/* เลขที่ */}
                                <span className="text-xs font-mono font-bold text-gray-400 dark:text-gray-500 w-6 text-center shrink-0">
                                    {student.number || '-'}
                                </span>

                                {/* Avatar + status dot */}
                                <div className="relative shrink-0">
                                    <Link to={`/school/${schoolId}/students/view/${student.id}`}>
                                        <ProfileAvatar
                                            src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random&color=fff&rounded=true&size=64&length=2`}
                                            alt={student.firstName}
                                            className="w-9 h-9 border-2 border-white dark:border-[#2a2b2f] shadow-sm"
                                            imageClassName="transition-transform group-hover:scale-105"
                                        />
                                    </Link>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-[#2a2b2f] ${
                                        attendance[student.id] === 'present' ? 'bg-green-500' :
                                        attendance[student.id] === 'late' ? 'bg-yellow-500' :
                                        attendance[student.id] === 'leave' ? 'bg-blue-500' :
                                        attendance[student.id] === 'escape' ? 'bg-orange-500' : 'bg-red-500'
                                    }`}>
                                        {studentLeaves[student.id] && (
                                            <div className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm">
                                                <FaLock size={8} className="text-gray-500" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Name + code */}
                                <div className="min-w-0 flex-1">
                                    <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block min-w-0">
                                        <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                            {student.nickname ? `น้อง${student.nickname}` : `${student.prefix || ''}${student.firstName} ${student.lastName}`}
                                        </p>
                                        {student.nickname && (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{student.prefix}{student.firstName} {student.lastName}</p>
                                        )}
                                    </Link>
                                    <p className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-0.5">
                                        รหัส {student.studentId || student.studentNumber || '-'}
                                    </p>
                                </div>

                                {/* Status buttons — compact horizontal */}
                                <div className="shrink-0 flex items-center gap-1.5">
                                    {statusOptions.map(opt => (
                                        <button
                                            key={opt.status}
                                            onClick={() => onToggleStatus(student.id, opt.status as any)}
                                            disabled={isSubmitted || isHoliday || studentLeaves[student.id]}
                                            title={opt.label}
                                            className={`
                                                flex items-center justify-center px-3 py-1.5 rounded-lg font-bold text-xs transition-all duration-200
                                                ${attendance[student.id] === opt.status
                                                    ? `${opt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] shadow-sm`
                                                    : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                                                }
                                                ${(isSubmitted || isHoliday || studentLeaves[student.id]) ? 'cursor-not-allowed opacity-60' : ''}
                                            `}
                                        >
                                            {opt.status === 'escape' ? <FaRunning className="text-xs" /> : opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Grid view — desktop cards OR PWA single column */}
            {(isPwaMode || viewMode === 'grid') && (
                <div className={isPwaMode ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"}>
                    {students.map((student) => {
                        const fullName = `${student.firstName} ${student.lastName || ''}`.trim();
                        const cleanName = fullName.replace(/^(พระสามเณร|พระมหา|พระครู|พระใบฎีกา|หลวงพ่อ|พระอาจารย์|พระ|สามเณร|เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นาย|นางสาว|นาง)\s*/, '').trim();
                        return (
                            <div
                                key={student.id}
                                className={`relative group rounded-2xl border-2 transition-all duration-300 hover:shadow-lg min-w-0 overflow-hidden ${isPwaMode ? 'p-3' : 'p-4 sm:p-6'} ${getStatusStyle(attendance[student.id])}`}
                            >
                                <div className={isPwaMode ? "flex flex-col gap-3" : "flex flex-row sm:flex-col items-center gap-4"}>
                                    <div className={isPwaMode ? "flex items-center gap-3 min-w-0" : "contents"}>
                                        {/* Avatar with Status Dot */}
                                        <div className="relative flex-shrink-0">
                                            <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block relative">
                                                <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur"></div>
                                                <ProfileAvatar
                                                    src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random&color=fff&rounded=true&size=128&length=2`}
                                                    alt={student.firstName}
                                                    className={`relative border-4 border-white dark:border-[#2a2b2f] shadow-sm ${isPwaMode ? 'w-14 h-14' : 'w-16 h-16 sm:w-24 sm:h-24'}`}
                                                    imageClassName="transition-transform group-hover:scale-105"
                                                />
                                            </Link>
                                            <div className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${
                                                attendance[student.id] === 'present' ? 'bg-green-500' :
                                                attendance[student.id] === 'late' ? 'bg-yellow-500' :
                                                attendance[student.id] === 'leave' ? 'bg-blue-500' :
                                                attendance[student.id] === 'escape' ? 'bg-orange-500' : 'bg-red-500'
                                            }`}>
                                                {studentLeaves[student.id] && (
                                                    <div className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm">
                                                        <FaLock size={10} className="text-gray-500" />
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Info */}
                                        <div className={`flex-grow min-w-0 overflow-hidden w-full space-y-0.5 ${isPwaMode ? 'text-left' : 'text-left sm:text-center'}`}>
                                            <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block transition-colors min-w-0">
                                                {student.nickname ? (
                                                    <>
                                                        <div className={`text-gray-900 dark:text-white font-black mb-0.5 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors ${isPwaMode ? 'mt-0 text-base' : 'mt-2 sm:mt-0 text-base sm:text-lg'}`} title={`น้อง${student.nickname}`}>
                                                            น้อง{student.nickname}
                                                        </div>
                                                        <div className={`font-medium text-gray-500 dark:text-gray-400 truncate ${isPwaMode ? 'text-xs' : 'text-xs sm:text-sm'}`} title={`${student.prefix || ''}${student.firstName} ${student.lastName}`}>
                                                            {student.prefix}{student.firstName} {student.lastName}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <h3 className={`text-gray-900 dark:text-white font-bold mb-0.5 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors ${isPwaMode ? 'mt-0 text-sm' : 'mt-2 sm:mt-0 text-sm sm:text-base'}`} title={`${student.prefix || ''}${student.firstName} ${student.lastName}`}>
                                                        {student.prefix}{student.firstName} {student.lastName}
                                                    </h3>
                                                )}
                                            </Link>
                                            <div className={`text-gray-500 dark:text-gray-400 w-full truncate ${isPwaMode ? 'mt-1' : 'mt-1 sm:mt-1.5'}`}>
                                                <span className={`inline-block max-w-full bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono truncate ${isPwaMode ? 'text-[10px]' : 'text-[10px] sm:text-[11px]'}`}>
                                                    รหัส {student.studentId || student.studentNumber || '-'} | เลขที่ {student.number || '-'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Controls */}
                                    <div className={`w-full min-w-0 flex flex-col gap-1.5 ${isPwaMode ? 'mt-0' : 'mt-4 sm:mt-2'}`}>
                                        {renderStatusButtons(student, isPwaMode)}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default StudentGrid;
