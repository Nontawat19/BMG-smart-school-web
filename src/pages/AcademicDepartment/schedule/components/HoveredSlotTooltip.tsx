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
            <div className="relative w-[240px] p-4 bg-[#1a1b1e] border border-white/10 rounded-[24px] shadow-2xl">
                <div className="flex items-center justify-between mb-3 px-1 text-indigo-400 font-black text-[10px] uppercase">
                    <span>รายละเอียดวิชา</span>
                    {(() => {
                        const c = hoveredSlot.courses[0];
                        const courseDoc = allCourses.find(doc => doc.id === c?.id);
                        return courseDoc?.isElective ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-900/40 text-rose-400 border border-rose-800/30 tracking-wide animate-pulse">วิชาเลือก</span>
                        ) : null;
                    })()}
                </div>
                <div className="h-[1px] w-full bg-white/5 mb-4"></div>
                <div className="space-y-2.5 px-1 text-[11px] font-black text-white">
                    <div className="flex"><span className="w-20 text-gray-500">รหัสวิชา:</span><span className="flex-1 truncate">{hoveredSlot.isDynamicUnavailable ? 'LOCK' : (hoveredSlot.courses[0]?.code || '-')}</span></div>
                    <div className="flex"><span className="w-20 text-gray-500">ชื่อวิชา:</span><span className="flex-1 leading-tight">{hoveredSlot.isDynamicUnavailable ? 'คาบล็อครายบุคคล' : (hoveredSlot.courses[0]?.title || 'ไม่มีข้อมูล')}</span></div>
                    <div className="flex"><span className="w-20 text-gray-500">ครูผู้สอน:</span><span className="flex-1 truncate">
                        {(() => {
                            if (hoveredSlot.isDynamicUnavailable) return '(คาบล็อค)';
                            const c = hoveredSlot.courses[0];
                            if (!c) return '(ไม่ระบุ)';

                            const courseDoc = allCourses.find(doc => doc.id === c.id);
                            const assign = courseDoc?.teacherAssignments?.find(a => a.groupNumber === c.groupNumber);
                            const teacherIds = getAssignmentTeacherIds(c).length > 0
                                ? getAssignmentTeacherIds(c)
                                : (assign ? getAssignmentTeacherIds(assign) : (c.teacherId ? [c.teacherId] : []));

                            if (teacherIds.length === 0) return '(ไม่ระบุ)';
                            return teacherIds.map(teacherId => {
                                const teacher = teachers?.find(t => t.id === teacherId || t.teacherId === teacherId);
                                if (teacher) {
                                    const fullName = `${teacher.title || 'ครู'}${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
                                    return fullName.replace(/\$$/, '') || teacher.name?.replace(/\$$/, '') || '(ไม่ระบุ)';
                                }
                                return (teacherId === 'pending' || teacherId?.startsWith('GHOST') ? 'รอระบุครู' : (teacherId?.replace(/\$$/, '') || '(ไม่ระบุ)'));
                            }).join(', ');
                        })()}
                    </span></div>
                    <div className="flex"><span className="w-20 text-gray-500">ชั้น:</span><span className="flex-1">{hoveredSlot.isDynamicUnavailable ? 'global' : formatClassWithGroup(hoveredSlot.courses[0])}</span></div>
                    <div className="flex"><span className="w-20 text-gray-500">สถานที่:</span><span className="flex-1 text-[#4ade80]">
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
