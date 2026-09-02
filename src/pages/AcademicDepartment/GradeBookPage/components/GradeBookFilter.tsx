import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, CalendarDays, BookOpen, Search, Users, X } from 'lucide-react';
import { Course } from '../types';

interface GradeBookFilterProps {
    selectedClass: string;
    setSelectedClass: React.Dispatch<React.SetStateAction<string>>;
    selectedRoom: string;
    setSelectedRoom: React.Dispatch<React.SetStateAction<string>>;
    setSelectedCourse: React.Dispatch<React.SetStateAction<string>>;
    availableClassOptions: [string, string][];
    selectedCourse: string;
    selectedGroup: string;
    setSelectedGroup: React.Dispatch<React.SetStateAction<string>>;
    availableGroups: { id: string, label: string }[];
    selectedSemester: string;
    setSelectedSemester: React.Dispatch<React.SetStateAction<string>>;
    filteredCourses: Course[];
    searchTerm: string;
    setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
}

const GradeBookFilter: React.FC<GradeBookFilterProps> = ({
    selectedClass,
    setSelectedClass,
    selectedRoom,
    setSelectedRoom,
    setSelectedCourse,
    availableClassOptions,
    selectedCourse,
    selectedGroup,
    setSelectedGroup,
    availableGroups,
    selectedSemester,
    setSelectedSemester,
    filteredCourses,
    searchTerm,
    setSearchTerm,
}) => {
    const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);
    const [courseDropdownCoords, setCourseDropdownCoords] = useState({ left: 0, top: 0, width: 0, maxHeight: 300 });
    const courseInputRef = useRef<HTMLInputElement>(null);
    const courseFieldRef = useRef<HTMLDivElement>(null);
    const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const selectedCourseObj = useMemo(
        () => filteredCourses.find(c => c.id === selectedCourse),
        [filteredCourses, selectedCourse]
    );

    const courseDisplayValue = isCourseDropdownOpen
        ? searchTerm
        : (selectedCourseObj ? `${selectedCourseObj.code} ${selectedCourseObj.title}` : searchTerm);

    const updateCourseDropdownPosition = () => {
        if (!courseFieldRef.current) return;
        const rect = courseFieldRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setCourseDropdownCoords({
            left: rect.left,
            top: rect.bottom + 4,
            width: rect.width,
            maxHeight: Math.max(160, Math.min(spaceBelow - 16, 400)),
        });
    };

    const openCourseDropdown = () => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        updateCourseDropdownPosition();
        setSearchTerm('');
        setIsCourseDropdownOpen(true);
    };

    const closeCourseDropdown = () => {
        blurTimeoutRef.current = setTimeout(() => setIsCourseDropdownOpen(false), 150);
    };

    // Close instead of leaving a dropdown floating over the wrong spot once the page scrolls/resizes.
    useEffect(() => {
        if (!isCourseDropdownOpen) return;
        const handleScrollOrResize = () => setIsCourseDropdownOpen(false);
        window.addEventListener('scroll', handleScrollOrResize, true);
        window.addEventListener('resize', handleScrollOrResize);
        return () => {
            window.removeEventListener('scroll', handleScrollOrResize, true);
            window.removeEventListener('resize', handleScrollOrResize);
        };
    }, [isCourseDropdownOpen]);

    const selectCourse = (courseId: string) => {
        if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
        setSelectedCourse(courseId);
        setSelectedGroup('');
        setSearchTerm('');
        setIsCourseDropdownOpen(false);
        courseInputRef.current?.blur();
    };

    const clearSelectedCourse = () => {
        setSelectedCourse('');
        setSelectedGroup('');
        setSearchTerm('');
        courseInputRef.current?.focus();
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 bg-white/80 dark:bg-[#2a2b2f]/60 backdrop-blur-xl p-3 rounded-2xl shadow-lg shadow-indigo-500/5 border border-white/50 dark:border-white/5 transition-all duration-300 group/container items-end">
            {/* ชั้นเรียน */}
            <div className="md:col-span-1 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1 uppercase tracking-wider ml-0.5">
                    ชั้นเรียน
                </label>
                <div className="relative">
                    <select
                        value={selectedClass}
                        onChange={(e) => { 
                            setSelectedClass(e.target.value); 
                            setSelectedCourse(''); 
                            setSelectedGroup('');
                        }}
                        className="w-full pl-3 pr-8 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer whitespace-nowrap text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">ชั้น...</option>
                        {availableClassOptions.map(([id, name]) => <option key={id} value={id} className="bg-white dark:bg-gray-800">{name}</option>)}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* ห้องเรียน */}
            <div className="md:col-span-1 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1 uppercase tracking-wider ml-0.5">
                    ห้อง
                </label>
                <div className="relative">
                    <select
                        value={selectedRoom}
                        onChange={(e) => {
                            setSelectedRoom(e.target.value);
                            setSelectedCourse('');
                            setSelectedGroup('');
                        }}
                        disabled={!selectedClass}
                        className="w-full pl-3 pr-8 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer disabled:opacity-40 whitespace-nowrap text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">ทุกห้อง</option>
                        {Array.from({ length: 20 }, (_, i) => i + 1).map(room => (
                            <option key={room} value={String(room)} className="bg-white dark:bg-gray-800">{room}</option>
                        ))}
                    </select>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* ภาคเรียน */}
            <div className="md:col-span-2 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1 uppercase tracking-wider ml-0.5">
                    ภาคเรียน
                </label>
                <div className="relative">
                    <select
                        value={selectedSemester}
                        onChange={(e) => {
                            setSelectedSemester(e.target.value);
                            setSelectedCourse('');
                            setSelectedGroup('');
                        }}
                        className="w-full pl-9 pr-8 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">ทุกภาคเรียน</option>
                        <option value="1" className="bg-white dark:bg-gray-800">ภาคเรียนที่ 1</option>
                        <option value="2" className="bg-white dark:bg-gray-800">ภาคเรียนที่ 2</option>
                        <option value="annual" className="bg-white dark:bg-gray-800">ทั้งปีการศึกษา</option>
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/70">
                        <CalendarDays size={16} />
                    </div>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>

            {/* รายวิชา - ค้นหาแล้วเลือกได้ทันทีโดยไม่ต้องเปิดดร็อปดาวน์ */}
            <div className="md:col-span-5 group relative">
                <label className="flex items-center gap-2 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1 uppercase tracking-wider ml-0.5">
                    รายวิชาที่เปิดสอน
                </label>
                <div className="relative" ref={courseFieldRef}>
                    <input
                        ref={courseInputRef}
                        type="text"
                        placeholder="พิมพ์รหัสหรือชื่อวิชาเพื่อค้นหา..."
                        value={courseDisplayValue}
                        onFocus={openCourseDropdown}
                        onChange={(e) => {
                            if (!isCourseDropdownOpen) setIsCourseDropdownOpen(true);
                            setSearchTerm(e.target.value);
                        }}
                        onBlur={closeCourseDropdown}
                        onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                                setIsCourseDropdownOpen(false);
                                courseInputRef.current?.blur();
                            } else if (e.key === 'Enter' && filteredCourses.length > 0) {
                                e.preventDefault();
                                selectCourse(filteredCourses[0].id);
                            }
                        }}
                        className="w-full pl-9 pr-10 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all font-bold text-xs shadow-sm truncate text-gray-900 dark:text-gray-100"
                    />
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/70">
                        <Search size={16} />
                    </div>
                    {selectedCourseObj && !isCourseDropdownOpen ? (
                        <button
                            type="button"
                            tabIndex={-1}
                            onMouseDown={(e) => { e.preventDefault(); clearSelectedCourse(); }}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                        >
                            <X size={14} />
                        </button>
                    ) : (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                            <BookOpen size={14} />
                        </div>
                    )}
                </div>

                {isCourseDropdownOpen && createPortal(
                    <div
                        className="fixed inset-0 z-[9999]"
                        onMouseDown={() => setIsCourseDropdownOpen(false)}
                    >
                        <div
                            style={{
                                position: 'fixed',
                                left: courseDropdownCoords.left,
                                top: courseDropdownCoords.top,
                                width: courseDropdownCoords.width,
                                maxHeight: courseDropdownCoords.maxHeight,
                            }}
                            className="overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl"
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            {filteredCourses.length === 0 ? (
                                <div className="px-4 py-3 text-xs text-gray-400 text-center">ไม่พบรายวิชาที่ตรงกับคำค้นหา</div>
                            ) : (
                                filteredCourses.map(c => {
                                    const semesterTag = (c.semester === '1-2' || c.semester === 'annual' || !c.semester) ? ' [รายปี]' : '';
                                    return (
                                        <div
                                            key={c.id}
                                            role="button"
                                            tabIndex={-1}
                                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); selectCourse(c.id); }}
                                            className={`px-3 py-2 text-xs cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors ${c.id === selectedCourse ? 'bg-indigo-50 dark:bg-indigo-500/10 font-bold' : ''}`}
                                        >
                                            <span className="font-black text-indigo-600 dark:text-indigo-400">{c.code}</span>
                                            {' '}
                                            <span className="text-gray-800 dark:text-gray-100">{c.title}{semesterTag}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>,
                    document.body
                )}
            </div>

            {/* กลุ่มเรียน (เดิมคือห้อง) */}
            <div className="md:col-span-3 group">
                <label className="flex items-center gap-1 text-[9px] font-black text-indigo-600/50 dark:text-indigo-400/40 mb-1 uppercase tracking-wider ml-0.5">
                    กลุ่มเรียน / ห้องเรียน
                </label>
                <div className="relative">
                    <select
                        value={selectedGroup}
                        onChange={(e) => setSelectedGroup(e.target.value)}
                        disabled={!selectedCourse}
                        className="w-full pl-9 pr-8 py-1.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all appearance-none font-bold text-xs shadow-sm cursor-pointer disabled:opacity-40 text-gray-900 dark:text-gray-100"
                    >
                        <option value="" className="bg-white dark:bg-gray-800">{!selectedCourse ? 'กรุณาเลือกวิชา...' : 'ทุกกลุ่ม / ห้อง'}</option>
                        {availableGroups.map(g => (
                            <option key={g.id} value={g.id} className="bg-white dark:bg-gray-800">{g.label}</option>
                        ))}
                    </select>
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-indigo-500/70">
                        <Users size={16} />
                    </div>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                        <ChevronDown size={12} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GradeBookFilter;
