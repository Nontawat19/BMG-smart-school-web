import React from 'react';
import { FaCheck, FaClock, FaUserSlash, FaTimes } from "react-icons/fa";

interface AttendanceSummaryProps {
    summary: {
        มา: number;
        สาย: number;
        ลา: number;
        ขาด: number;
    };
}

const AttendanceSummary: React.FC<AttendanceSummaryProps> = ({ summary }) => {
    return (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* มาเรียน */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">มาเรียน</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{summary.มา}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-500/20 flex items-center justify-center text-green-600 dark:text-green-400">
                    <FaCheck className="text-xl" />
                </div>
            </div>

            {/* มาสาย */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">มาสาย</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{summary.สาย}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-yellow-100 dark:bg-yellow-500/20 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                    <FaClock className="text-xl" />
                </div>
            </div>

            {/* ลา */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ลา</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{summary.ลา}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                    <FaUserSlash className="text-xl" />
                </div>
            </div>

            {/* ขาดเรียน */}
            <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl p-4 border border-gray-100 dark:border-gray-700 shadow-sm flex items-center justify-between relative group">
                <div>
                    <p className="text-sm font-medium text-gray-500 dark:text-gray-400">ขาดเรียน</p>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{summary.ขาด}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-red-600 dark:text-red-400">
                    <FaTimes className="text-xl" />
                </div>
            </div>
        </div>
    );
};

export default AttendanceSummary;
