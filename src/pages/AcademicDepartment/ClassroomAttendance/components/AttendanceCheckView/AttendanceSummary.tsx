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

const ITEMS = [
    { key: 'มา' as const, label: 'มาเรียน', Icon: FaCheck, bg: 'bg-green-100 dark:bg-green-500/20', color: 'text-green-600 dark:text-green-400' },
    { key: 'สาย' as const, label: 'มาสาย', Icon: FaClock, bg: 'bg-yellow-100 dark:bg-yellow-500/20', color: 'text-yellow-600 dark:text-yellow-400' },
    { key: 'ลา' as const, label: 'ลา', Icon: FaUserSlash, bg: 'bg-blue-100 dark:bg-blue-500/20', color: 'text-blue-600 dark:text-blue-400' },
    { key: 'หนีเรียน' as const, label: 'หนีเรียน', Icon: FaRunning, bg: 'bg-orange-100 dark:bg-orange-500/20', color: 'text-orange-600 dark:text-orange-400' },
    { key: 'ขาด' as const, label: 'ขาดเรียน', Icon: FaTimes, bg: 'bg-red-100 dark:bg-red-500/20', color: 'text-red-600 dark:text-red-400' },
];

const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({ summary }) => {
    const isPwaMode = usePwaMode();

    if (isPwaMode) {
        return (
            <div className="grid grid-cols-5 gap-1.5">
                {ITEMS.map(({ key, label, Icon, bg, color }) => (
                    <div
                        key={key}
                        className="flex flex-col items-center justify-center gap-1 p-2 bg-white dark:bg-[#2a2b2f] rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm min-w-0"
                    >
                        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center ${color} shrink-0`}>
                            <Icon className="text-xs" />
                        </div>
                        <p className="text-xl font-bold text-gray-900 dark:text-white leading-none">{summary[key]}</p>
                        <p className="text-[9px] font-medium text-gray-500 dark:text-gray-400 text-center leading-tight">{label}</p>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {ITEMS.map(({ key, label, Icon, bg, color }) => (
                <div
                    key={key}
                    className="bg-white dark:bg-[#2a2b2f] rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between p-4 relative group min-w-0"
                >
                    <div>
                        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{summary[key]}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center ${color} shrink-0`}>
                        <Icon className="text-xl" />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AttendanceSummary;
