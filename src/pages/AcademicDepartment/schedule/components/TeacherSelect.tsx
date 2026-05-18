<<<<<<< HEAD
import React, { useState, useMemo, useEffect } from 'react';
import Select, { components, MenuListProps } from 'react-select';
import { User, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
=======
import React from 'react';
import Select from 'react-select';
import { User, ChevronDown } from 'lucide-react';
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { Teacher } from '../types';
import { useTheme } from '@/ThemeContext';

interface TeacherSelectProps {
    teachers: Teacher[];
    selectedTeacher: string;
    setSelectedTeacher: (val: string) => void;
    setSchedule: (val: any) => void;
}

export const TeacherSelect: React.FC<TeacherSelectProps> = ({
    teachers,
    selectedTeacher,
    setSelectedTeacher,
    setSchedule
}) => {
    const { isDarkMode } = useTheme();
<<<<<<< HEAD
    const [currentPage, setCurrentPage] = useState(1);
    const [inputValue, setInputValue] = useState('');
    const itemsPerPage = 9;

    // Reset to page 1 when search input changes
    useEffect(() => {
        setCurrentPage(1);
    }, [inputValue]);

    // Custom MenuList component to handle pagination
    const CustomMenuList = useMemo(() => (props: MenuListProps<any>) => {
        const { children } = props;
        
        // children is an array of Option components (filtered by react-select)
        const childrenArray = React.Children.toArray(children);
        const totalItems = childrenArray.length;
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        
        // Ensure currentPage is within bounds
        const safeCurrentPage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));
        
        const startIndex = (safeCurrentPage - 1) * itemsPerPage;
        const pagedChildren = childrenArray.slice(startIndex, startIndex + itemsPerPage);

        // Add numbering to each child based on its original index in the filtered list
        const numberedChildren = React.Children.map(pagedChildren, (child, index) => {
            if (React.isValidElement(child)) {
                const element = child as React.ReactElement<any>;
                const actualIndex = startIndex + index + 1;
                return React.cloneElement(element, {
                    label: `${actualIndex}. ${element.props?.label || ''}`
                });
            }
            return child;
        });

        return (
            <components.MenuList {...props}>
                <div className="flex flex-col">
                    <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                        {numberedChildren}
                    </div>
                    
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 mt-1 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 rounded-b-xl">
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setCurrentPage(prev => Math.max(prev - 1, 1));
                                }}
                                disabled={safeCurrentPage === 1}
                                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all text-gray-500 dark:text-gray-400 group"
                            >
                                <div className="flex items-center gap-1">
                                    <ChevronLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
                                    <span className="text-[10px] font-black uppercase tracking-wider">ย้อนกลับ</span>
                                </div>
                            </button>

                            <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[150px] px-2">
                                {Array.from({ length: totalPages }, (_, i) => i + 1).map(pageNum => (
                                    <button
                                        key={pageNum}
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setCurrentPage(pageNum);
                                        }}
                                        className={`min-w-[28px] h-7 flex items-center justify-center rounded-lg text-[10px] font-black transition-all flex-shrink-0 ${
                                            safeCurrentPage === pageNum
                                                ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/30 scale-110'
                                                : 'hover:bg-white dark:hover:bg-white/10 text-gray-500 dark:text-gray-400'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                ))}
                            </div>

                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setCurrentPage(prev => Math.min(prev + 1, totalPages));
                                }}
                                disabled={safeCurrentPage === totalPages}
                                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all text-gray-500 dark:text-gray-400 group"
                            >
                                <div className="flex items-center gap-1">
                                    <span className="text-[10px] font-black uppercase tracking-wider">ถัดไป</span>
                                    <ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                                </div>
                            </button>
                        </div>
                    )}
                </div>
            </components.MenuList>
        );
    }, [currentPage, itemsPerPage]);
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)

    return (
        <div className="relative group">
            <Select
<<<<<<< HEAD
                components={{ MenuList: CustomMenuList }}
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                menuPortalTarget={document.body}
                value={teachers.find(t => t.id === selectedTeacher) ? (() => {
                    const t = teachers.find(t => t.id === selectedTeacher)!;
                    return {
                        value: selectedTeacher,
                        label: t.name,
                        teacher: t
                    };
                })() : null}
<<<<<<< HEAD
                inputValue={inputValue}
                onInputChange={(val) => setInputValue(val)}
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                onChange={(option: any) => {
                    const val = option?.value || '';
                    setSelectedTeacher(val);
                    if (!val) {
                        setSchedule({});
                    }
                }}
<<<<<<< HEAD
                onMenuOpen={() => {
                    // Optional: Reset to page 1 when menu opens if desired
                    // setCurrentPage(1);
                }}
                options={teachers.map(teacher => ({
                    value: teacher.id,
                    label: `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || teacher.name || ''}`.trim(),
=======
                options={teachers.map(teacher => ({
                    value: teacher.id,
                    label: teacher.name,
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    teacher: teacher
                }))}
                placeholder="เลือกครู..."
                isClearable
                className="react-select-container"
                classNamePrefix="react-select"
                formatOptionLabel={(data: any) => (
                    <div className="flex items-center gap-3 py-1">
                        <div className="relative flex-shrink-0">
                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[8px] font-black text-slate-500 dark:text-slate-400 overflow-hidden ring-1 ring-white/20 shadow-sm">
                                {data.teacher?.profileImageUrl ? (
                                    <img src={data.teacher.profileImageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="uppercase">{data.teacher?.firstName?.substring(0, 1) || data.teacher?.name?.substring(0, 1) || ''}</span>
                                )}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 border border-white dark:border-slate-800"></div>
                        </div>
                        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                            <span className="text-[8px] font-black text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/20 tracking-tighter whitespace-nowrap">
                                {data.teacher?.teacherId || 'ID:N/A'}
                            </span>
                            <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 whitespace-nowrap overflow-hidden">
<<<<<<< HEAD
                                {data.label}
=======
                                {data.teacher?.title || ''}{data.teacher?.firstName || ''} {data.teacher?.lastName || data.teacher?.name || ''}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            </span>
                        </div>
                    </div>
                )}
                styles={{
                    control: (base, state) => ({
                        ...base,
                        paddingLeft: '6px',
                        minHeight: '36px',
                        height: '36px',
                        borderRadius: '12px',
                        borderColor: state.isFocused ? '#f59e0b' : isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                        boxShadow: 'none',
                        '&:hover': {
                            borderColor: state.isFocused ? '#f59e0b' : isDarkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'
                        },
                        backgroundColor: isDarkMode ? 'rgba(30, 41, 59, 0.7)' : 'white',
                        transition: 'all 0.2s ease',
                    }),
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    option: (base, state) => ({
                        ...base,
                        backgroundColor: state.isSelected
                            ? isDarkMode ? 'rgba(245, 158, 11, 0.2)' : 'rgba(245, 158, 11, 0.1)'
                            : state.isFocused ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' : 'transparent',
                        color: state.isSelected ? '#f59e0b' : isDarkMode ? '#cbd5e1' : '#334155',
                        padding: '8px 12px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        margin: '2px 8px',
                        width: 'calc(100% - 16px)',
                        fontSize: '11px',
                        fontWeight: '700'
                    }),
                    menu: (base) => ({
                        ...base,
                        backgroundColor: isDarkMode ? '#1e293b' : '#ffffff',
                        borderRadius: '14px',
                        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
                        border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)',
                        marginTop: '4px',
                        minWidth: 'max-content',
                    }),
                    valueContainer: (base) => ({
                        ...base,
                        padding: '0 4px',
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'nowrap',
                    }),
                    singleValue: (base) => ({
                        ...base,
                        color: isDarkMode ? 'white' : '#1e293b',
                        fontWeight: '800',
                        fontSize: '11px',
                        margin: 0,
                        padding: 0,
                        maxWidth: 'calc(100% - 10px)',
                    }),
                    placeholder: (base) => ({
                        ...base,
                        color: isDarkMode ? 'rgba(255,255,255,0.4)' : '#94a3b8',
                        fontSize: '11px',
                        fontWeight: '700'
                    }),
                    input: (base) => ({
                        ...base,
                        color: isDarkMode ? 'white' : '#1e293b',
                        margin: 0,
                        padding: 0,
                    }),
                    indicatorSeparator: () => ({ display: 'none' }),
                    dropdownIndicator: (base) => ({
                        ...base,
                        color: isDarkMode ? '#64748b' : '#94a3b8',
                        padding: '0 8px',
                        '&:hover': { color: '#f59e0b' }
                    }),
                    clearIndicator: (base) => ({
                        ...base,
                        color: isDarkMode ? '#64748b' : '#94a3b8',
                        padding: '0 4px',
                        '&:hover': { color: '#ef4444' }
                    }),
                    indicatorsContainer: (base) => ({
                        ...base,
                        height: '34px',
                    })
                }}
<<<<<<< HEAD
            />
=======

            />
            {/* <User removed as per request /> */}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
        </div>
    );
};
