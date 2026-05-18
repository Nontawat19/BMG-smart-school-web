import { useState, useMemo, useEffect } from 'react';
import { Course, Teacher } from '../types';

<<<<<<< HEAD
const courseMatchesRoom = (courseRooms: unknown, selectedRoom: string) => {
    if (!selectedRoom || selectedRoom === 'all') return true;
    if (!Array.isArray(courseRooms) || courseRooms.length === 0) return true;

    const normalizedRooms = courseRooms.map(room => String(room).trim().toLowerCase());
    return normalizedRooms.includes('all') || normalizedRooms.includes(String(selectedRoom).trim().toLowerCase());
};

=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
export const useGradeBookFilters = (
    initialClass: string,
    initialRoom: string,
    initialSemester: string,
<<<<<<< HEAD
    initialCourse: string,
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    initialGroup: string,
    courses: Course[],
    teacherMap: Record<string, Teacher>,
    userPrivileges: any,
    academicYear: string
) => {
    const [selectedClass, setSelectedClass] = useState<string>(initialClass);
    const [selectedRoom, setSelectedRoom] = useState<string>(initialRoom);
    const [selectedSemester, setSelectedSemester] = useState<string>(initialSemester);
<<<<<<< HEAD
    const [selectedCourse, setSelectedCourse] = useState<string>(initialCourse);
=======
    const [selectedCourse, setSelectedCourse] = useState<string>('');
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
<<<<<<< HEAD

            if (!courseMatchesRoom(c.room, selectedRoom)) {
                return false;
            }
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
            
            // Semester Filter Logic
            if (selectedSemester && selectedSemester !== 'annual') {
                const isAnnualCourse = c.semester === '1-2' || c.semester === 'annual' || !c.semester;
                if (!isAnnualCourse && c.semester !== selectedSemester) return false;
            }

            // Teacher / My Courses Filter
            const courseTeacherIds = new Set<string>();
            if (c.teacherId) courseTeacherIds.add(c.teacherId);
            if (c.teacherIds) c.teacherIds.forEach(id => courseTeacherIds.add(id));
<<<<<<< HEAD
            if (c.teacherAssignments) {
                c.teacherAssignments.forEach((a: any) => {
=======
            if ((c as any).teacherAssignments) {
                (c as any).teacherAssignments.forEach((a: any) => {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                    if (a.teacherId) courseTeacherIds.add(a.teacherId);
                });
            }

            const myIds = userPrivileges.myTeacherIds || [];
<<<<<<< HEAD
            if (!userPrivileges.canSeeAll && myIds.length > 0) {
=======
            if (myIds.length > 0) {
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
<<<<<<< HEAD
    }, [selectedClass, selectedRoom, selectedSemester, courses, userPrivileges, searchTerm, academicYear]);
=======
    }, [selectedClass, selectedSemester, courses, userPrivileges, searchTerm, academicYear]);
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)


    // Derive available groups for the selected course
    const availableGroups = useMemo(() => {
        if (!selectedCourse) return [];
        const course = courses.find(c => c.id === selectedCourse);
<<<<<<< HEAD
        if (!course || !course.teacherAssignments) return [];

        return course.teacherAssignments
=======
        if (!course || !(course as any).teacherAssignments) return [];

        const assignments = (course as any).teacherAssignments as any[];
        return assignments
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
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
