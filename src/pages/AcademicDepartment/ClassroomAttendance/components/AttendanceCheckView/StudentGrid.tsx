import React from 'react';
import { Link } from "react-router-dom";
import { FaLock } from "react-icons/fa";
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
    onToggleStatus: (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => void;
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
    const getStatusStyle = (status?: string) => {
        switch (status) {
            case 'present': return 'border-green-200 dark:border-green-900 bg-green-50/30 dark:bg-green-900/5';
            case 'late': return 'border-yellow-200 dark:border-yellow-900 bg-yellow-50/30 dark:bg-yellow-900/5';
            case 'leave': return 'border-blue-200 dark:border-blue-900 bg-blue-50/30 dark:bg-blue-900/5';
            case 'absent': return 'border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-900/5';
            default: return 'border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f]';
        }
    };

    const statusOptions = [
        { status: 'present', label: 'มา', colorClass: 'text-green-600 dark:text-green-400', bgClass: 'bg-green-100 dark:bg-green-900/30', activeClass: 'bg-white dark:bg-gray-700 text-green-600 shadow-sm ring-1 ring-green-200' },
        { status: 'late', label: 'สาย', colorClass: 'text-yellow-600 dark:text-yellow-400', bgClass: 'bg-yellow-100 dark:bg-yellow-900/30', activeClass: 'bg-white dark:bg-gray-700 text-yellow-600 shadow-sm ring-1 ring-yellow-200' },
        { status: 'leave', label: 'ลา', colorClass: 'text-blue-600 dark:text-blue-400', bgClass: 'bg-blue-100 dark:bg-blue-900/30', activeClass: 'bg-white dark:bg-gray-700 text-blue-600 shadow-sm ring-1 ring-blue-200' },
        { status: 'absent', label: 'ขาด', colorClass: 'text-red-600 dark:text-red-400', bgClass: 'bg-red-100 dark:bg-red-900/30', activeClass: 'bg-white dark:bg-gray-700 text-red-600 shadow-sm ring-1 ring-red-200' },
    ];

    if (loading) {
        return (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
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

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {students.map((student) => (
                <div
                    key={student.id}
                    className={`relative group rounded-2xl p-4 sm:p-6 border-2 transition-all duration-300 hover:shadow-lg ${getStatusStyle(attendance[student.id])}`}
                >
                    <div className="flex flex-row sm:flex-col items-center gap-4">
                        {/* Avatar with Status Dot */}
                        <div className="relative flex-shrink-0">
                            <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block relative">
                                <div className="absolute -inset-1 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity blur"></div>
                                {(() => {
                                    const fullName = `${student.firstName} ${student.lastName || ''}`.trim();
                                    const cleanName = fullName.replace(/^(เด็กชาย|เด็กหญิง|ด\.ช\.|ด\.ญ\.|นาย|นางสาว|นาง)\s*/, '').trim();

                                    return (
                                        <img
                                            src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=random&color=fff&rounded=true&size=128&length=2`}
                                            alt={student.firstName}
                                            className="relative w-16 h-16 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white dark:border-[#2a2b2f] shadow-sm transition-transform group-hover:scale-105"
                                        />
                                    );
                                })()}
                            </Link>
                            <div className={`absolute bottom-0 right-0 sm:bottom-1 sm:right-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 sm:border-4 border-white dark:border-[#2a2b2f] shadow-sm ${attendance[student.id] === 'present' ? 'bg-green-500' :
                                attendance[student.id] === 'late' ? 'bg-yellow-500' :
                                    attendance[student.id] === 'leave' ? 'bg-blue-500' : 'bg-red-500'
                                }`}>
                                {studentLeaves[student.id] && (
                                    <div className="absolute -top-1 -right-1 bg-white dark:bg-gray-800 rounded-full p-0.5 shadow-sm">
                                        <FaLock size={10} className="text-gray-500" />
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Info */}
                        <div className="flex-grow min-w-0 text-left sm:text-center overflow-hidden w-full space-y-0.5">
                            <Link to={`/school/${schoolId}/students/view/${student.id}`} className="block transition-colors">
                                {student.nickname ? (
                                    <>
                                        <div className="text-gray-900 dark:text-white font-black mb-0.5 mt-2 sm:mt-0 text-base sm:text-lg truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={`น้อง${student.nickname}`}>
                                            น้อง{student.nickname}
                                        </div>
                                        <div className="font-medium text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate" title={`${student.prefix || ''}${student.firstName} ${student.lastName}`}>
                                            {student.prefix}{student.firstName} {student.lastName}
                                        </div>
                                    </>
                                ) : (
                                    <h3 className="text-gray-900 dark:text-white font-bold mb-0.5 mt-2 sm:mt-0 text-sm sm:text-base truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={`${student.prefix || ''}${student.firstName} ${student.lastName}`}>
                                        {student.prefix}{student.firstName} {student.lastName}
                                    </h3>
                                )}
                            </Link>
                            <div className="text-gray-500 dark:text-gray-400 mt-1 sm:mt-1.5 w-full truncate">
                                <span className="inline-block bg-white/50 dark:bg-black/20 px-2 py-0.5 rounded-md font-mono text-[10px] sm:text-[11px]">
                                    รหัส {student.studentId || student.studentNumber || '-'} | เลขที่ {student.number || '-'}
                                </span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="w-full grid grid-cols-4 gap-2 mt-4 sm:mt-2">
                            {statusOptions.map(opt => (
                                <button
                                    key={opt.status}
                                    onClick={() => onToggleStatus(student.id, opt.status as any)}
                                    disabled={isSubmitted || isHoliday || studentLeaves[student.id]}
                                    className={`
                    flex flex-col items-center justify-center py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200
                    ${attendance[student.id] === opt.status
                                            ? `${opt.activeClass} ring-2 ring-offset-1 ring-offset-white dark:ring-offset-[#2a2b2f] transform scale-105 shadow-md`
                                            : 'bg-white/50 dark:bg-black/20 text-gray-400 hover:bg-white dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300'
                                        }
                    ${(isSubmitted || isHoliday || studentLeaves[student.id]) ? 'cursor-not-allowed opacity-60' : ''}
                  `}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default StudentGrid;
