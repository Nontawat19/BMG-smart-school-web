import React from 'react';
import { CalendarDays } from 'lucide-react';

interface HolidayViewProps {
    holidayName: string;
}

const HolidayView: React.FC<HolidayViewProps> = ({ holidayName }) => {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-white dark:bg-[#2a2b2f] rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-700">
            <div className="w-24 h-24 bg-red-50 dark:bg-red-900/20 rounded-full flex items-center justify-center mb-6 animate-pulse">
                <CalendarDays size={48} className="text-red-500 dark:text-red-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">วันนี้เป็นวันหยุด</h2>
            <p className="text-xl text-red-600 dark:text-red-400 font-semibold mb-4">{holidayName}</p>
            <p className="text-gray-500 dark:text-gray-400">
                ไม่มีการเรียนการสอนและการเช็คชื่อในวันนี้
            </p>
        </div>
    );
};

export default HolidayView;
