import React from 'react';
import { FaCheck, FaClock, FaUserSlash, FaTimes, FaRunning } from "react-icons/fa";
import { useResponsivePwaMode as usePwaMode } from "@/hooks/useResponsivePwaMode";

interface AttendanceSummaryProps {
    summary: {
        มา: number;
        สาย: number;
        ลา: number;
        ขาด: number;
        หนีเรียน: number;
    };
}

const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({ summary }) => {
    const isPwaMode = usePwaMode();

    return (
        <div className={isPwaMode ? "grid grid-cols-2 gap-3" : "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4"}>
            {/* มาเรียน */}
            <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <div>
                    <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>มาเรียน</p>
                    <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{summary.มา}</p>
                </div>
                <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400 shrink-0`}>
                    <FaCheck className={isPwaMode ? "text-lg" : "text-xl"} />
                </div>
            </div>

            {/* มาสาย */}
            <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <div>
                    <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>มาสาย</p>
                    <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{summary.สาย}</p>
                </div>
                <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400 shrink-0`}>
                    <FaClock className={isPwaMode ? "text-lg" : "text-xl"} />
                </div>
            </div>

            {/* ลา */}
            <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <div>
                    <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>ลา</p>
                    <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{summary.ลา}</p>
                </div>
                <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0`}>
                    <FaUserSlash className={isPwaMode ? "text-lg" : "text-xl"} />
                </div>
            </div>

            {/* หนีเรียน */}
            <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <div>
                    <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>หนีเรียน</p>
                    <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{summary.หนีเรียน}</p>
                </div>
                <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0`}>
                    <FaRunning className={isPwaMode ? "text-lg" : "text-xl"} />
                </div>
            </div>

            {/* ขาดเรียน */}
            <div className={`bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group min-w-0 ${isPwaMode ? 'p-3' : 'p-4'}`}>
                <div>
                    <p className={`${isPwaMode ? 'text-xs' : 'text-sm'} font-medium text-gray-500 dark:text-gray-400`}>ขาดเรียน</p>
                    <p className={`${isPwaMode ? 'text-2xl' : 'text-3xl'} font-bold text-gray-900 dark:text-white mt-1`}>{summary.ขาด}</p>
                </div>
                <div className={`${isPwaMode ? 'w-10 h-10' : 'w-12 h-12'} rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400 shrink-0`}>
                    <FaTimes className={isPwaMode ? "text-lg" : "text-xl"} />
                </div>
            </div>
        </div>
    );
};

export default AttendanceSummary;
