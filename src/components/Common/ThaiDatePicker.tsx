import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from '../../ThemeContext';
<<<<<<< HEAD
import { getThaiYear } from '@/utils/dateUtils';
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

interface ThaiDatePickerProps {
    value: string | null;
    onChange: (value: string) => void;
    placeholder?: string;
    events?: Record<string, any>;
    className?: string; // Add className prop for flexibility
}

const ThaiDatePicker: React.FC<ThaiDatePickerProps> = ({
    value,
    onChange,
    placeholder,
    events,
    className
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [viewDate, setViewDate] = useState(new Date());
    const containerRef = useRef<HTMLDivElement>(null);
    const { isDarkMode } = useTheme();

    useEffect(() => {
        if (value) {
            const [y, m, d] = value.split('-').map(Number);
            setViewDate(new Date(y, m - 1, d));
        }
    }, [value, isOpen]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelectDate = (day: number) => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth() + 1;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        onChange(dateStr);
        setIsOpen(false);
    };

    const changeMonth = (delta: number) => {
        setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
    };

    const renderDays = () => {
        const year = viewDate.getFullYear();
        const month = viewDate.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfWeek = new Date(year, month, 1).getDay();

        const days = [];
        for (let i = 0; i < firstDayOfWeek; i++) {
            days.push(<div key={`empty-${i}`} />);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = value === dateStr;
            const isToday = new Date().toDateString() === new Date(year, month, d).toDateString();
            const event = events?.[dateStr];

            let cellClass = 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200';
            let titleText = '';

            if (isSelected) {
                cellClass = 'bg-indigo-600 text-white hover:bg-indigo-700';
            } else if (event) {
                if (event.type === 'holiday') {
                    cellClass = 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300';
                    titleText = event.description || 'วันหยุดราชการ';
                } else if (event.type === 'specialHoliday') {
                    cellClass = 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300';
                    titleText = event.description || 'วันหยุดกรณีพิเศษ';
                } else if (event.type === 'schoolDay') {
                    cellClass = 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300';
                    titleText = event.description || 'วันเรียนชดเชย';
                }
            }

            if (isToday && !isSelected) {
                cellClass += ' border border-indigo-500 text-indigo-500';
            }

            days.push(
                <button
                    key={d}
                    type="button"
                    onClick={() => handleSelectDate(d)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors ${cellClass}`}
                    title={titleText}
                >
                    {d}
                </button>
            );
        }
        return days;
    };

    const displayValue = value
        ? (() => {
            const [y, m, d] = value.split('-').map(Number);
<<<<<<< HEAD
            const date = new Date(y, m - 1, d);
            return `${d} ${thaiMonths[m - 1]} ${getThaiYear(date)}`;
=======
            return `${d} ${thaiMonths[m - 1]} ${y + 543}`;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        })()
        : '';

    return (
        <div className={`relative w-full ${className || ''}`} ref={containerRef}>
            <div
                onClick={() => setIsOpen(!isOpen)}
                className="w-full bg-white dark:bg-[#1e1f21] border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-gray-900 dark:text-white cursor-pointer flex justify-between items-center focus-within:ring-2 focus-within:ring-indigo-500 min-h-[42px]"
            >
                <span className={!displayValue ? 'text-gray-400' : ''}>{displayValue || placeholder || 'เลือกวันที่'}</span>
                <span className="text-gray-500">📅</span>
            </div>

            {isOpen && (
                <div className="absolute z-50 mt-1 w-72 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 p-4 left-0 sm:left-auto sm:right-0 md:left-0 text-gray-900 dark:text-white">
                    <div className="flex justify-between items-center mb-4">
                        <button type="button" onClick={() => changeMonth(-1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300">&lt;</button>
                        <span className="font-bold text-gray-900 dark:text-white">
<<<<<<< HEAD
                            {thaiMonths[viewDate.getMonth()]} {getThaiYear(viewDate)}
=======
                            {thaiMonths[viewDate.getMonth()]} {viewDate.getFullYear() + 543}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                        </span>
                        <button type="button" onClick={() => changeMonth(1)} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-gray-600 dark:text-gray-300">&gt;</button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2 text-center">
                        {['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'].map(d => (
                            <span key={d} className="text-xs font-semibold text-gray-500 dark:text-gray-400">{d}</span>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1">
                        {renderDays()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ThaiDatePicker;
