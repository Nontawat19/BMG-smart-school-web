import React, { useState, useMemo, useEffect } from 'react';
import Select, { components, MenuListProps } from 'react-select';
import { User, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Teacher } from '../types';
import { useTheme } from '@/ThemeContext';
import { getActiveSortedTeachers } from '@/utils/teacherSortUtils';

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

    const sortedTeacherOptions = useMemo(() => {
        return getActiveSortedTeachers(teachers)
            .map((teacher, index) => ({
                value: teacher.id,
                label: `${teacher.title || ''}${teacher.firstName || ''} ${teacher.lastName || teacher.name || ''}`.trim(),
                teacher: teacher,
                displayIndex: index + 1 // Add index for visual numbering if desired (currently used in formatOptionLabel)
            }));
    }, [teachers]);

    return (
        <div className="relative group">
            <Select
                menuPortalTarget={document.body}
                value={sortedTeacherOptions.find(opt => opt.value === selectedTeacher) || null}
                onChange={(option: any) => {
                    const val = option?.value || '';
                    setSelectedTeacher(val);
                    if (!val) {
                        setSchedule({});
                    }
                }}
                onMenuOpen={() => {
                    // Optional: Reset to page 1 when menu opens if desired
                    // setCurrentPage(1);
                }}
                options={sortedTeacherOptions}
                placeholder="เลือกครู..."
                isClearable
                className="react-select-container"
                classNamePrefix="react-select"
                formatOptionLabel={(data: any) => (
                    <div className="flex items-center gap-3 py-1">
                        <div className="relative flex-shrink-0">
                            <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-[8px] font-black text-slate-500 dark:text-slate-400 overflow-hidden ring-1 ring-white/20 shadow-sm">
                                {data.teacher?.profileImageUrl ? (
                                    <img src={data.teacher.profileImageUrl} alt="" className="w-full h-full object-cover object-[center_20%]" />
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
                                {data.label}
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
                        padding: '4px 12px',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        margin: '1px 8px',
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
                        overflowX: 'hidden',
                        width: '100%',
                        minWidth: '300px',
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
                    menuList: (base) => ({
                        ...base,
                        maxHeight: '350px',
                        padding: 0,
                    }),
                    indicatorsContainer: (base) => ({
                        ...base,
                        height: '34px',
                    })
                }}
            />
        </div>
    );
};
