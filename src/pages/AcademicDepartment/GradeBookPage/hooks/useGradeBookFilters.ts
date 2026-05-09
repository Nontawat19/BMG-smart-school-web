import { useState, useMemo, useEffect } from 'react';
import { Course, Teacher } from '../types';

const courseMatchesRoom = (courseRooms: unknown, selectedRoom: string) => {
    if (!selectedRoom || selectedRoom === 'all') return true;
    if (!Array.isArray(courseRooms) || courseRooms.length === 0) return true;

    const normalizedRooms = courseRooms.map(room => String(room).trim().toLowerCase());
    return normalizedRooms.includes('all') || normalizedRooms.includes(String(selectedRoom).trim().toLowerCase());
};

export const useGradeBookFilters = (
    initialClass: string,
    initialRoom: string,
    initialSemester: string,
    initialCourse: string,
    initialGroup: string,
    courses: Course[],
    teacherMap: Record<string, Teacher>,
    userPrivileges: any,
    academicYear: string
) => {
    const [selectedClass, setSelectedClass] = useState<string>(initialClass);
    const [selectedRoom, setSelectedRoom] = useState<string>(initialRoom);
    const [selectedSemester, setSelectedSemester] = useState<string>(initialSemester);
    const [selectedCourse, setSelectedCourse] = useState<string>(initialCourse);
    const [selectedGroup, setSelectedGroup] = useState<string>(initialGroup);
    const [searchTerm, setSearchTerm] = useState('');

    // Course Filtering Logic
    const filteredCourses = useMemo(() => {
        return courses.filter((c: Course) => {
            // Academic Year Filter
            if (academicYear && (c as any).academicYear && (c as any).academicYear !== academicYear) {
                return false;
            }

            if (selectedClass) {
                const classIds = Array.isArray(c.classId) ? c.classId : [c.classId];
                if (!classIds.includes(selectedClass)) return false;
            }

            if (!courseMatchesRoom(c.room, selectedRoom)) {
                return false;
            }
            
            // Semester Filter Logic
            if (selectedSemester && selectedSemester !== 'annual') {
                const isAnnualCourse = c.semester === '1-2' || c.semester === 'annual' || !c.semester;
                if (!isAnnualCourse && c.semester !== selectedSemester) return false;
            }

            // Teacher / My Courses Filter
            const courseTeacherIds = new Set<string>();
            if (c.teacherId) courseTeacherIds.add(c.teacherId);
            if (c.teacherIds) c.teacherIds.forEach(id => courseTeacherIds.add(id));
            if (c.teacherAssignments) {
                c.teacherAssignments.forEach((a: any) => {
                    if (a.teacherId) courseTeacherIds.add(a.teacherId);
                });
            }

            const myIds = userPrivileges.myTeacherIds || [];
            if (!userPrivileges.canSeeAll && myIds.length > 0) {
                const isMyCourse = myIds.some((id: string) => courseTeacherIds.has(id));
                if (!isMyCourse) return false;
            } else if (!userPrivileges.canSeeAll) {
                return false;
            }

            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return (
                    c.code.toLowerCase().includes(term) ||
                    c.title.toLowerCase().includes(term)
                );
            }
            return true;
        });
    }, [selectedClass, selectedRoom, selectedSemester, courses, userPrivileges, searchTerm, academicYear]);


    // Derive available groups for the selected course
    const availableGroups = useMemo(() => {
        if (!selectedCourse) return [];
        const course = courses.find(c => c.id === selectedCourse);
        if (!course || !course.teacherAssignments) return [];

        return course.teacherAssignments
            .map(a => ({
                id: `กลุ่ม ${a.groupNumber}`,
                label: `กลุ่ม ${a.groupNumber} (${teacherMap[a.teacherId]?.name || 'ไม่ระบุครู'})`,
                rooms: a.targetRooms || a.roomIds || []
            }))
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [selectedCourse, courses, teacherMap]);

    // When course or groups change, update selectedGroup if invalid
    useEffect(() => {
        if (selectedCourse && availableGroups.length > 0) {
            // If current selectedGroup is not in available, pick the first one
            const isValid = availableGroups.some(g => g.id === selectedGroup);
            if (!isValid) {
                setSelectedGroup(availableGroups[0].id);
            }
        } else {
            setSelectedGroup('');
        }
    }, [selectedCourse, availableGroups, selectedGroup]);

    return {
        selectedClass, setSelectedClass,
        selectedRoom, setSelectedRoom,
        selectedSemester, setSelectedSemester,
        selectedCourse, setSelectedCourse,
        selectedGroup, setSelectedGroup,
        searchTerm, setSearchTerm,
        filteredCourses,
        availableGroups
    };
};
