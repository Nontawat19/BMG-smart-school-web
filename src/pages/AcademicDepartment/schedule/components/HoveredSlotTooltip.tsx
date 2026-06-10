import React from 'react';
import { Course, Teacher, getAssignmentTeacherIds } from '../types';
import { getClassDisplayName } from '../utils';

const formatClassWithGroup = (course?: Course) => {
    if (!course) return '';

    const className = getClassDisplayName(course.classId);
    const groupNumber = Number(course.groupNumber);

    if (Number.isFinite(groupNumber) && groupNumber > 0) {
        return `${className} กลุ่ม ${groupNumber}`;
    }

    return className;
};

const normalizeTeacherDisplayName = (value?: string) => {
    const raw = String(value || '').replace(/\r/g, '').trim();
    if (!raw) return '';

    const lines = raw
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean);

    const candidateLine = lines.find(line => {
        const compact = line.replace(/\s+/g, ' ').trim();
        if (!compact) return false;
        if (/^[A-Za-z0-9_-]{10,}$/.test(compact)) return false;
        return /[ก-๙A-Za-z]/.test(compact);
    }) || lines[0] || '';

    const compact = candidateLine.replace(/\s+/g, ' ').trim();
    if (!compact) return '';

    // Strip tokens that look like UIDs or internal references.
    return compact
        .replace(/\s+[A-Za-z0-9_-]{10,}(?=\s|$)/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

const getTeacherDisplayName = (teacher: Teacher | undefined, teacherId?: string) => {
    if (!teacher) {
        return teacherId === 'pending' || teacherId?.startsWith('GHOST')
            ? 'รอระบุครู'
            : '(ไม่ระบุ)';
    }

    const structuredName = normalizeTeacherDisplayName(
        [teacher.title, teacher.firstName, teacher.lastName].filter(Boolean).join(' ')
    );
    if (structuredName && structuredName !== 'ครู' && structuredName.length > 2) return structuredName;

    const fallbackName = normalizeTeacherDisplayName(teacher.name);
    if (fallbackName) return fallbackName;

    return teacherId === 'pending' || teacherId?.startsWith('GHOST')
        ? 'รอระบุครู'
        : '(ไม่ระบุ)';
};

interface HoveredSlotTooltipProps {
    hoveredSlot: any;
    allCourses: Course[];
    teachers: Teacher[];
    physicalRooms: any[];
}

export const HoveredSlotTooltip: React.FC<HoveredSlotTooltipProps> = ({
    hoveredSlot,
    allCourses,
    teachers,
    physicalRooms
}) => {
    if (!hoveredSlot) return null;

    return (
        <div
            className="fixed z-[9999] pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95"
            style={{
                top: hoveredSlot.rect.top - 210 > 0 ? hoveredSlot.rect.top - 210 : hoveredSlot.rect.bottom + 10,
                left: Math.max(10, Math.min(window.innerWidth - 250, hoveredSlot.rect.left + (hoveredSlot.rect.width / 2) - 120))
            }}
        >
            <div className="relative w-[240px] p-4 bg-white/95 dark:bg-[#1a1b1e] border border-slate-200/80 dark:border-white/10 rounded-[24px] shadow-2xl shadow-slate-900/10 dark:shadow-black/40 backdrop-blur-xl">
                <div className="flex items-center justify-between mb-3 px-1 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase">
                    <span>รายละเอียดวิชา</span>
                    {(() => {
                        const c = hoveredSlot.courses[0];
                        const courseDoc = allCourses.find(doc => doc.id === c?.id);
                        return courseDoc?.isElective ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-50 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200/70 dark:border-rose-800/30 tracking-wide animate-pulse">วิชาเลือก</span>
                        ) : null;
                    })()}
                </div>
                <div className="h-[1px] w-full bg-slate-200/80 dark:bg-white/5 mb-4"></div>
                <div className="space-y-2.5 px-1 text-[11px] font-black text-slate-900 dark:text-white">
                    <div className="flex"><span className="w-20 text-slate-500 dark:text-gray-500">รหัสวิชา:</span><span className="flex-1 truncate">{hoveredSlot.isDynamicUnavailable ? 'LOCK' : (hoveredSlot.courses[0]?.code || '-')}</span></div>
                    <div className="flex"><span className="w-20 text-slate-500 dark:text-gray-500">ชื่อวิชา:</span><span className="flex-1 leading-tight">{hoveredSlot.isDynamicUnavailable ? 'คาบล็อครายบุคคล' : (hoveredSlot.courses[0]?.title || 'ไม่มีข้อมูล')}</span></div>
                    <div className="flex">
                        <span className="w-20 shrink-0 text-slate-500 dark:text-gray-500">ครูผู้สอน:</span>
                        <div className="flex-1 flex flex-col gap-0.5 min-w-0">
                        {(() => {
                            if (hoveredSlot.isDynamicUnavailable) return <span>(คาบล็อค)</span>;
                            const c = hoveredSlot.courses[0];
                            if (!c) return <span>(ไม่ระบุ)</span>;

                            const courseDoc = allCourses.find(doc => doc.id === c.id);
                            const assign = courseDoc?.teacherAssignments?.find(a => a.groupNumber === c.groupNumber);
                            const teacherIds = getAssignmentTeacherIds(c).length > 0
                                ? getAssignmentTeacherIds(c)
                                : (assign ? getAssignmentTeacherIds(assign) : (c.teacherId ? [c.teacherId] : []));

                            if (teacherIds.length === 0) return <span>(ไม่ระบุ)</span>;
                            return teacherIds.map((teacherId, index) => {
                                const teacher = teachers?.find(t => t.id === teacherId || t.teacherId === teacherId);
                                const displayName = getTeacherDisplayName(teacher, teacherId);
                                return (
                                    <span key={index} className="truncate leading-tight">
                                        {displayName}
                                    </span>
                                );
                            });
                        })()}
                        </div>
                    </div>
                    <div className="flex"><span className="w-20 text-slate-500 dark:text-gray-500">ชั้น:</span><span className="flex-1">{hoveredSlot.isDynamicUnavailable ? 'global' : formatClassWithGroup(hoveredSlot.courses[0])}</span></div>
                    <div className="flex"><span className="w-20 text-slate-500 dark:text-gray-500">สถานที่:</span><span className="flex-1 text-emerald-600 dark:text-[#4ade80]">
                        {(() => {
                            if (hoveredSlot.isDynamicUnavailable) return '(คาบว่าง)';
                            const c = hoveredSlot.courses[0];
                            if (!c) return '(ไม่ระบุ)';
                            const roomIds = c.room || [];
                            if (roomIds.length === 0 || (roomIds.length === 1 && roomIds[0] === 'all')) return 'ห้องเรียนปกติ';
                            return roomIds.map((id: string) => {
                                const room = physicalRooms.find((item: any) => item.id === id);
                                if (!room) return id;
                                const roomName = room.roomName || '';
                                const roomCode = room.roomCode || '';
                                if (roomName && roomCode) return `${roomName} (${roomCode})`;
                                return roomName || roomCode || id;
                            }).join(', ');
                        })()}
                    </span></div>
                </div>
            </div>
        </div>
    );
};
