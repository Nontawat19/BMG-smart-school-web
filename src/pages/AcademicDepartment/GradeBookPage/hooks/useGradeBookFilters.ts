import { useState, useMemo, useEffect } from 'react';
import { Course, Teacher } from '../types';
import { isPassFailActivityCourse, SubjectGroupLike } from '@/utils/subjectGroupUtils';
import { CLASSES } from '@/utils/schoolUtils';

const toStringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String).map(v => v.trim()).filter(Boolean);
    if (value === null || value === undefined) return [];
    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
};

const classAliases: Record<string, string[]> = {
    k1: ['k1', 'อนุบาล 1', 'อ.1'],
    k2: ['k2', 'อนุบาล 2', 'อ.2'],
    k3: ['k3', 'อนุบาล 3', 'อ.3'],
    p1: ['p1', 'ป.1', 'ประถมศึกษาปีที่ 1'],
    p2: ['p2', 'ป.2', 'ประถมศึกษาปีที่ 2'],
    p3: ['p3', 'ป.3', 'ประถมศึกษาปีที่ 3'],
    p4: ['p4', 'ป.4', 'ประถมศึกษาปีที่ 4'],
    p5: ['p5', 'ป.5', 'ประถมศึกษาปีที่ 5'],
    p6: ['p6', 'ป.6', 'ประถมศึกษาปีที่ 6'],
    m1: ['m1', 'ม.1', 'มัธยมศึกษาปีที่ 1'],
    m2: ['m2', 'ม.2', 'มัธยมศึกษาปีที่ 2'],
    m3: ['m3', 'ม.3', 'มัธยมศึกษาปีที่ 3'],
    m4: ['m4', 'ม.4', 'มัธยมศึกษาปีที่ 4'],
    m5: ['m5', 'ม.5', 'มัธยมศึกษาปีที่ 5'],
    m6: ['m6', 'ม.6', 'มัธยมศึกษาปีที่ 6'],
};

const classMatches = (candidateLevels: unknown, selectedClass: string) => {
    if (!selectedClass) return true;

    const selected = String(selectedClass).trim().toLowerCase();
    const levels = toStringArray(candidateLevels).map(level => level.toLowerCase());
    if (levels.length === 0) return true;
    if (levels.includes(selected)) return true;

    if (selected === 'junior_high' || selected === 'ม.ต้น') {
        return levels.some(level => ['m1', 'm2', 'm3', 'ม.1', 'ม.2', 'ม.3', 'junior_high', 'ม.ต้น'].includes(level));
    }

    if (selected === 'senior_high' || selected === 'ม.ปลาย') {
        return levels.some(level => ['m4', 'm5', 'm6', 'ม.4', 'ม.5', 'ม.6', 'senior_high', 'ม.ปลาย'].includes(level));
    }

    const aliases = classAliases[selected] || [];
    return aliases.map(alias => alias.toLowerCase()).some(alias => levels.includes(alias));
};

const courseMatchesRoom = (courseRooms: unknown, selectedRoom: string) => {
    if (!selectedRoom || selectedRoom === 'all') return true;

    const normalizedRooms = toStringArray(courseRooms).map(room => room.toLowerCase());
    if (normalizedRooms.length === 0) return true;

    return normalizedRooms.includes('all') || normalizedRooms.includes(String(selectedRoom).trim().toLowerCase());
};

const assignmentMatchesFilters = (assignment: any, course: Course, selectedClass: string, selectedRoom: string) => {
    const assignmentLevels = toStringArray(assignment?.classLevels);
    const matchesClass = assignmentLevels.length > 0
        ? classMatches(assignmentLevels, selectedClass)
        : classMatches(course.classId, selectedClass);

    const assignmentRooms = [
        ...toStringArray(assignment?.room),
        ...toStringArray(assignment?.targetRooms),
    ];
    const matchesRoom = assignmentRooms.length > 0
        ? courseMatchesRoom(assignmentRooms, selectedRoom)
        : courseMatchesRoom(course.room, selectedRoom);

    return matchesClass && matchesRoom;
};

const courseMatchesClassAndRoom = (course: Course, selectedClass: string, selectedRoom: string) => {
    const assignments = course.teacherAssignments || [];
    if (assignments.length > 0) {
        return assignments.some(assignment => assignmentMatchesFilters(assignment, course, selectedClass, selectedRoom));
    }

    return classMatches(course.classId, selectedClass) && courseMatchesRoom(course.room, selectedRoom);
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
    academicYear: string,
    subjectGroups: SubjectGroupLike[] = []
) => {
    const [selectedClass, setSelectedClass] = useState<string>(initialClass);
    const [selectedRoom, setSelectedRoom] = useState<string>(initialRoom);
    const [selectedSemester, setSelectedSemester] = useState<string>(initialSemester);
    const [selectedCourse, setSelectedCourse] = useState<string>(initialCourse);
    const [selectedGroup, setSelectedGroup] = useState<string>(initialGroup);
    const [searchTerm, setSearchTerm] = useState('');

    const filteredCourses = useMemo(() => {
        return courses.filter((c: Course) => {
            if (isPassFailActivityCourse(c, subjectGroups)) {
                return false;
            }

            // Academic Year Filter
            if (academicYear && (c as any).academicYear && (c as any).academicYear !== academicYear) {
                return false;
            }

            if (!courseMatchesClassAndRoom(c, selectedClass, selectedRoom)) {
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
        }).map(course => {
            if (!course.teacherAssignments || course.teacherAssignments.length === 0) return course;

            const matchingAssignments = course.teacherAssignments.filter(assignment =>
                assignmentMatchesFilters(assignment, course, selectedClass, selectedRoom)
            );

            return {
                ...course,
                teacherAssignments: matchingAssignments.length > 0 ? matchingAssignments : course.teacherAssignments
            };
        });
    }, [selectedClass, selectedRoom, selectedSemester, courses, userPrivileges, searchTerm, academicYear, subjectGroups]);


    useEffect(() => {
        if (!selectedCourse) return;
        const isSelectedCourseVisible = filteredCourses.some(c => c.id === selectedCourse);
        if (!isSelectedCourseVisible) {
            setSelectedCourse('');
        }
    }, [selectedCourse, filteredCourses]);

    // Derive available groups for the selected course
    const availableGroups = useMemo(() => {
        if (!selectedCourse) return [];
        const course = filteredCourses.find(c => c.id === selectedCourse);
        if (!course || !course.teacherAssignments) return [];

        const seen = new Set<string>();
        return course.teacherAssignments
            .filter(a => {
                const key = String(a.groupNumber || '');
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .map(a => {
                const classText = toStringArray(a.classLevels)
                    .map(level => {
                        const normalized = level.toLowerCase().replace(/\./g, '');
                        return CLASSES[normalized] || level.toUpperCase().replace(/^M/, 'ม.').replace(/^P/, 'ป.').replace(/^K/, 'อ.');
                    })
                    .join(', ');
                const roomText = toStringArray(a.targetRooms).join(', ') || toStringArray((a as any).room).join(', ');
                const targetText = [classText, roomText ? `ห้อง ${roomText}` : ''].filter(Boolean).join(' • ');

                return {
                    id: `กลุ่ม ${a.groupNumber}`,
                    label: `กลุ่ม ${a.groupNumber}${targetText ? ` - ${targetText}` : ''} (${teacherMap[a.teacherId]?.name || 'ไม่ระบุครู'})`,
                    rooms: a.targetRooms || a.roomIds || []
                };
            })
            .sort((a, b) => a.id.localeCompare(b.id));
    }, [selectedCourse, filteredCourses, teacherMap]);

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
