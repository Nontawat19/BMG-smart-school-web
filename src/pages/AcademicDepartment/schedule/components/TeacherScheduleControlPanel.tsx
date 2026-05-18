import React, { useState, useMemo, useEffect } from 'react';
import Select, { components, MenuListProps } from 'react-select';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { CLASSES, thaiFormatClass } from '../utils';
import { Course, CourseInstance, Schedule, SchoolSettings, Teacher, getAssignmentTeacherIds } from '../types';
import { TeacherSelect } from './TeacherSelect';

interface TeacherScheduleControlPanelProps {
    isDarkMode: boolean;
    allCourses: Course[];
    availableCourseInstances: CourseInstance[];
    teachers: Teacher[];
    selectedTeacher: string;
    selectedSemester: string;
    filterClass: string;
    filterRoom: string;
    filterGroup: string;
    filterPhysicalRoom: string;
    physicalRooms: any[];
    searchTerm: string;
    schoolSettings: SchoolSettings;
    setSearchTerm: (value: string) => void;
    setSelectedTeacher: (value: string) => void;
    setSchedule: React.Dispatch<React.SetStateAction<Schedule>>;
    setFilterClass: (value: string) => void;
    setFilterRoom: (value: string) => void;
    setFilterGroup: (value: string) => void;
    setFilterPhysicalRoom: (value: string) => void;
}

export const TeacherScheduleControlPanel: React.FC<TeacherScheduleControlPanelProps> = ({
    isDarkMode,
    allCourses,
    availableCourseInstances,
    teachers,
    selectedTeacher,
    selectedSemester,
    filterClass,
    filterRoom,
    filterGroup,
    filterPhysicalRoom,
    physicalRooms,
    searchTerm,
    schoolSettings,
    setSearchTerm,
    setSelectedTeacher,
    setSchedule,
    setFilterClass,
    setFilterRoom,
    setFilterGroup,
    setFilterPhysicalRoom
}) => {
    const courseMatchesRoom = (course: Course) => {
        if (filterRoom === 'all') return true;

        const courseClassIds = Array.isArray(course.classId) ? course.classId : [course.classId].filter(Boolean) as string[];
        const assignedClassIds = course.teacherAssignments
            ?.filter(a => !selectedTeacher || getAssignmentTeacherIds(a).includes(selectedTeacher))
            .flatMap(a => a.classLevels || []) || [];
        const allAssociatedClasses = [...courseClassIds, ...assignedClassIds];

        return allAssociatedClasses.some(id => {
            const parts = String(id).split('/');
            if (parts.length < 2) return false;
            const roomPart = parts[1].trim();
            if (filterRoom === 'แผน') return roomPart === 'แผน';
            return Number(roomPart) === Number(filterRoom);
        });
    };

    const courseMatchesGroup = (course: Course) => {
        if (filterGroup === 'all') return true;

        return course.teacherAssignments
            ?.filter(a => !selectedTeacher || getAssignmentTeacherIds(a).includes(selectedTeacher))
            .some(a => String(a.groupNumber || 1) === filterGroup) || false;
    };

    const handleClassChange = (option: any) => {
        const nextClass = option?.value || 'all';
        setFilterClass(nextClass);

        if (nextClass !== 'all') {
            setFilterRoom('1');
            setFilterGroup('1');
        }
    };


    return (
        <section className="bg-white dark:bg-[#2a2b2f] border-none rounded-[24px] p-4 shadow-sm relative overflow-hidden group transition-colors">
            <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-indigo-500/20 to-transparent"></div>
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="w-1 h-5 rounded-full bg-indigo-600"></div>
                    <h2 className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-[0.2em]">แผงควบคุมการเลือกวิชา</h2>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.5fr_0.6fr_0.6fr_0.6fr_1fr] gap-4">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-indigo-500/20 text-indigo-400 text-[10px] font-black border border-indigo-500/30">1</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">รายวิชา</label>
                    </div>
                    <div className="relative group/input">
                        <Select
                            menuPortalTarget={document.body}
                            value={searchTerm ? { value: searchTerm, label: allCourses.find(c => c.code === searchTerm)?.title || searchTerm, course: allCourses.find(c => c.code === searchTerm) } : null}
                            onChange={(option: any) => setSearchTerm(option?.value || '')}
                            options={[
                                { value: '', label: 'ทุกรายวิชา...' },
                                ...allCourses
                                    .filter(c => {
                                        const semStr = String(c.semester || "");
                                        const targetSem = String(selectedSemester || "1");
                                        const isCorrectSemester = !c.semester || semStr === targetSem || semStr.startsWith(targetSem + '/') || targetSem.startsWith(semStr + '/');
                                        if (!isCorrectSemester) return false;

                                        const hasAssignments = (c.teacherAssignments?.length || 0) > 0;
                                        const isForSelectedTeacher = !selectedTeacher || c.teacherAssignments?.some(a => getAssignmentTeacherIds(a).includes(selectedTeacher));

                                        const classIds = Array.isArray(c.classId) ? c.classId : [c.classId].filter(Boolean) as string[];
                                        const assignedClasses = c.teacherAssignments?.filter(a => !selectedTeacher || getAssignmentTeacherIds(a).includes(selectedTeacher)).flatMap(a => a.classLevels || []) || [];
                                        const allAssociatedClasses = [...classIds, ...assignedClasses];
                                        const isForSelectedClass = filterClass === 'all' || allAssociatedClasses.some(id => id === filterClass || id.startsWith(filterClass + '/'));

                                        if (!hasAssignments || !isForSelectedTeacher || !isForSelectedClass || !courseMatchesRoom(c) || !courseMatchesGroup(c)) return false;

                                        const remainingCount = availableCourseInstances.filter(inst => inst.code === c.code).length;
                                        return remainingCount > 0;
                                    })
                                    .sort((a, b) => a.code.localeCompare(b.code))
                                    .map(course => ({
                                        value: course.code,
                                        label: `${course.code} - ${course.title}`,
                                        course
                                    }))
                            ]}
                            placeholder="เลือกรายวิชา..."
                            isClearable
                            className="react-select-container text-xs font-black"
                            classNamePrefix="react-select"
                            styles={{
                                control: (base) => ({
                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    fontWeight: '800'
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '16px',
                                    overflowX: 'hidden',
                                    width: '100%',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                }),
                                option: (base, { isFocused, isSelected }) => ({
                                    ...base,
                                    backgroundColor: isSelected
                                        ? '#4f46e5'
                                        : isFocused
                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            : 'transparent',
                                    color: isDarkMode ? 'white' : 'black',
                                    cursor: 'pointer',
                                    padding: '4px 12px',
                                    margin: '1px 8px',
                                    borderRadius: '8px',
                                    width: 'calc(100% - 16px)',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                }),
                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
                                menuList: (base) => ({ ...base, maxHeight: '350px', padding: 0 })
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 text-[10px] font-black border border-amber-500/30">2</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ครูผู้สอน</label>
                    </div>
                    <TeacherSelect teachers={teachers} selectedTeacher={selectedTeacher} setSelectedTeacher={setSelectedTeacher} setSchedule={setSchedule} />
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 text-[10px] font-black border border-emerald-500/30">3</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ระดับชั้น</label>
                    </div>
                    <div className="relative group/input">
                        <Select
                            menuPortalTarget={document.body}
                            value={filterClass !== 'all' ? { value: filterClass, label: thaiFormatClass(CLASSES[filterClass as keyof typeof CLASSES] || filterClass) } : { value: 'all', label: 'เลือกชั้น...' }}
                            onChange={handleClassChange}
                            options={[
                                { value: 'all', label: 'เลือกชั้น...' },
                                ...schoolSettings.availableClasses.map((k) => ({
                                    value: k,
                                    label: thaiFormatClass(CLASSES[k as keyof typeof CLASSES] || k)
                                }))
                            ]}
                            placeholder="เลือกชั้น..."
                            className="react-select-container text-xs font-black"
                            classNamePrefix="react-select"
                            styles={{
                                control: (base) => ({
                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    fontWeight: '800'
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '16px',
                                    overflowX: 'hidden',
                                    width: '100%',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                }),
                                option: (base, { isFocused, isSelected }) => ({
                                    ...base,
                                    backgroundColor: isSelected
                                        ? '#4f46e5'
                                        : isFocused
                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            : 'transparent',
                                    color: isDarkMode ? 'white' : 'black',
                                    cursor: 'pointer',
                                    padding: '4px 12px',
                                    margin: '1px 8px',
                                    borderRadius: '8px',
                                    width: 'calc(100% - 16px)',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                }),
                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
                                menuList: (base) => ({ ...base, maxHeight: '350px', padding: 0 })
                            }}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 text-[10px] font-black border border-cyan-500/30">4</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">ห้อง</label>
                    </div>
                    <div className="relative group/input">
                        <Select
                            menuPortalTarget={document.body}
                            value={filterRoom !== 'all' ? { value: filterRoom, label: `ห้อง ${filterRoom}` } : { value: 'all', label: 'เลือกห้อง...' }}
                            onChange={(option: any) => setFilterRoom(option?.value || 'all')}
                            options={[
                                { value: 'all', label: 'เลือกห้อง...' },
                                ...Array.from({ length: 20 }, (_, i) => {
                                    const num = (i + 1).toString();
                                    return { value: num, label: `ห้อง ${num}` };
                                }),
                                { value: 'แผน', label: 'ห้อง แผน' }
                            ]}
                            placeholder="เลือกห้อง..."
                            className="react-select-container text-xs font-black"
                            classNamePrefix="react-select"
                            styles={{
                                control: (base) => ({
                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    fontWeight: '800'
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '16px',
                                    overflowX: 'hidden',
                                    width: '100%',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                }),
                                option: (base, { isFocused, isSelected }) => ({
                                    ...base,
                                    backgroundColor: isSelected
                                        ? '#4f46e5'
                                        : isFocused
                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            : 'transparent',
                                    color: isDarkMode ? 'white' : 'black',
                                    cursor: 'pointer',
                                    padding: '4px 12px',
                                    margin: '1px 8px',
                                    borderRadius: '8px',
                                    width: 'calc(100% - 16px)',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                }),
                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
                                menuList: (base) => ({ ...base, maxHeight: '350px', padding: 0 })
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-black border border-blue-500/30">5</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">กลุ่มเรียน</label>
                    </div>
                    <div className="relative group/input">
                        <Select
                            menuPortalTarget={document.body}
                            value={filterGroup !== 'all' ? { value: filterGroup, label: `กลุ่ม ${filterGroup}` } : { value: 'all', label: 'เลือกกลุ่ม...' }}
                            onChange={(option: any) => setFilterGroup(option?.value || 'all')}
                            options={[
                                { value: 'all', label: 'เลือกกลุ่ม...' },
                                ...Array.from({ length: 20 }, (_, i) => ({
                                    value: String(i + 1),
                                    label: `กลุ่ม ${i + 1}`
                                }))
                            ]}
                            placeholder="เลือกกลุ่ม..."
                            className="react-select-container text-xs font-black"
                            classNamePrefix="react-select"
                            styles={{
                                control: (base) => ({
                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    fontWeight: '800'
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '16px',
                                    overflowX: 'hidden',
                                    width: '100%',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                }),
                                option: (base, { isFocused, isSelected }) => ({
                                    ...base,
                                    backgroundColor: isSelected
                                        ? '#4f46e5'
                                        : isFocused
                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            : 'transparent',
                                    color: isDarkMode ? 'white' : 'black',
                                    cursor: 'pointer',
                                    padding: '4px 12px',
                                    margin: '1px 8px',
                                    borderRadius: '8px',
                                    width: 'calc(100% - 16px)',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                }),
                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
                                menuList: (base) => ({ ...base, maxHeight: '350px', padding: 0 })
                            }}
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                        <span className="flex items-center justify-center w-5 h-5 rounded-lg bg-violet-500/20 text-violet-400 text-[10px] font-black border border-violet-500/30">6</span>
                        <label className="text-[10px] font-black text-gray-600 dark:text-gray-400 uppercase tracking-widest">สถานที่</label>
                    </div>
                    <div className="relative group/input">
                        <Select
                            menuPortalTarget={document.body}
                            value={filterPhysicalRoom !== 'all' ? { 
                                value: filterPhysicalRoom, 
                                label: physicalRooms.find(r => r.id === filterPhysicalRoom) ? `${physicalRooms.find(r => r.id === filterPhysicalRoom).roomCode ? `(${physicalRooms.find(r => r.id === filterPhysicalRoom).roomCode}) ` : ''}${physicalRooms.find(r => r.id === filterPhysicalRoom).roomName}` : filterPhysicalRoom 
                            } : { value: 'all', label: 'ทุกสถานที่...' }}
                            onChange={(option: any) => setFilterPhysicalRoom(option?.value || 'all')}
                            options={[
                                { value: 'all', label: 'ทุกสถานที่...' },
                                ...physicalRooms.map((room: any) => ({
                                    value: room.id,
                                    label: `${room.roomCode ? `(${room.roomCode}) ` : ''}${room.roomName}`
                                }))
                            ]}
                            placeholder="เลือกสถานที่..."
                            className="react-select-container text-xs font-black"
                            classNamePrefix="react-select"
                            styles={{
                                control: (base) => ({
                                    ...base, minHeight: '36px', height: '36px', borderRadius: '12px',
                                    backgroundColor: isDarkMode ? 'rgba(255,255,255,0.03)' : 'rgba(249, 250, 251, 0.8)',
                                    borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                                    fontWeight: '800'
                                }),
                                menu: (base) => ({
                                    ...base,
                                    backgroundColor: isDarkMode ? '#1a1b1e' : 'white',
                                    border: isDarkMode ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)',
                                    borderRadius: '16px',
                                    overflowX: 'hidden',
                                    width: '100%',
                                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                                }),
                                option: (base, { isFocused, isSelected }) => ({
                                    ...base,
                                    backgroundColor: isSelected
                                        ? '#4f46e5'
                                        : isFocused
                                            ? isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'
                                            : 'transparent',
                                    color: isDarkMode ? 'white' : 'black',
                                    cursor: 'pointer',
                                    padding: '4px 12px',
                                    margin: '1px 8px',
                                    borderRadius: '8px',
                                    width: 'calc(100% - 16px)',
                                    fontSize: '11px',
                                    fontWeight: '700'
                                }),
                                valueContainer: (base) => ({ ...base, padding: '0 8px' }),
                                indicatorsContainer: (base) => ({ ...base, height: '36px' }),
                                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                                singleValue: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black' }),
                                input: (base) => ({ ...base, color: isDarkMode ? 'white' : 'black', margin: 0, padding: 0 }),
                                placeholder: (base) => ({ ...base, color: isDarkMode ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }),
                                menuList: (base) => ({ ...base, maxHeight: '350px', padding: 0 })
                            }}
                        />
                    </div>
                </div>
            </div>
        </section>
    );
};
