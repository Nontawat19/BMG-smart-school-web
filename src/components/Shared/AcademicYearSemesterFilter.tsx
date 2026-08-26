import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { fetchAvailableAcademicYears } from '@/utils/remediationUtils';
import { CalendarRange } from 'lucide-react';

interface AcademicYearSemesterFilterProps {
    schoolId: string;
    // '' = ทุกปีการศึกษา (สะสมทุกปี — ค่าเดิมของระบบ)
    academicYear: string;
    onAcademicYearChange: (value: string) => void;
    // '' = ตลอดปีการศึกษา (ทั้ง 2 ภาคเรียนของปีที่เลือก)
    semester: string;
    onSemesterChange: (value: string) => void;
    className?: string;
}

// ตัวกรองปีการศึกษา/ภาคเรียนแบบย้อนหลังได้หลายปี — อ้างอิงรายชื่อปีการศึกษาที่ตั้งค่าไว้แล้วที่หน้า
// /academic/school-calendar (main_calendar/{ปี}) ใช้ร่วมกันในทุกหน้าของเมนู "แสดงผล 0 ร มส มผ"
const AcademicYearSemesterFilter: React.FC<AcademicYearSemesterFilterProps> = ({
    schoolId, academicYear, onAcademicYearChange, semester, onSemesterChange, className = '',
}) => {
    const reduxYear = useSelector((state: RootState) => state.calendar.academicYear);
    const [years, setYears] = useState<string[]>([]);

    useEffect(() => {
        if (!schoolId) return;
        fetchAvailableAcademicYears(schoolId).then(list => {
            // fetchAvailableAcademicYears คืนมาไม่เกิน 10 ปีล่าสุดอยู่แล้ว แต่ต้องตัดซ้ำอีกทีหลังรวมปีจาก redux
            const merged = Array.from(new Set([...(reduxYear ? [reduxYear] : []), ...list]))
                .sort((a, b) => Number(b) - Number(a))
                .slice(0, 10);
            setYears(merged);
        }).catch(err => console.error('Error loading academic years:', err));
    }, [schoolId, reduxYear]);

    // ล้างค่าภาคเรียนทุกครั้งที่เคลียร์ปีการศึกษากลับเป็น "ทุกปีการศึกษา" — กันไม่ให้ค้างเป็น
    // "กรองเฉพาะภาคเรียนนี้ทุกปี" โดยที่ผู้ใช้ไม่ได้ตั้งใจ (ปีการศึกษาและภาคเรียนต้องสอดคล้องกันเสมอ)
    const handleAcademicYearChange = (value: string) => {
        onAcademicYearChange(value);
        if (!value && semester) onSemesterChange('');
    };

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <CalendarRange size={14} className="text-gray-400 shrink-0" />
            <select
                value={academicYear}
                onChange={(e) => handleAcademicYearChange(e.target.value)}
                className="px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold"
            >
                <option value="">ทุกปีการศึกษา</option>
                {years.map(y => <option key={y} value={y}>ปีการศึกษา {y}</option>)}
            </select>
            <select
                value={semester}
                onChange={(e) => onSemesterChange(e.target.value)}
                disabled={!academicYear}
                className="px-2.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold disabled:opacity-40"
            >
                <option value="">ตลอดปีการศึกษา</option>
                <option value="1">ภาคเรียนที่ 1</option>
                <option value="2">ภาคเรียนที่ 2</option>
            </select>
        </div>
    );
};

export default AcademicYearSemesterFilter;
