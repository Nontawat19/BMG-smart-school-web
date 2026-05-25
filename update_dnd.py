import re

with open('/Users/nontawatsuwanabupha/BMS SmartSchool/src/pages/AcademicDepartment/CourseAssignmentPage2.tsx', 'r') as f:
    content = f.read()

# 1. Update lucide-react imports
lucide_import_re = r'import\s+\{([^}]+)\}\s+from\s+"lucide-react";'
def add_grip(match):
    imports = match.group(1)
    if 'GripVertical' not in imports:
        imports += ',\n    GripVertical'
    return f'import {{{imports}\n}} from "lucide-react";'
content = re.sub(lucide_import_re, add_grip, content)

# 2. Add dnd-kit imports and draggable components
dnd_imports_and_components = """
import {
    DndContext,
    DragOverlay,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    useDraggable,
    useDroppable,
    defaultDropAnimationSideEffects
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

// --- DND Components ---
const DraggableCourseCard = ({ course }: { course: Course }) => {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: `course-${course.id}`,
        data: { type: 'course', course }
    });
    return (
        <div 
            ref={setNodeRef} 
            {...listeners} 
            {...attributes} 
            className={`flex flex-col w-[160px] h-[90px] p-3 bg-white dark:bg-[#161a27] border ${isDragging ? 'border-indigo-500 opacity-50' : 'border-slate-200 dark:border-white/10'} rounded-xl shadow-sm cursor-grab active:cursor-grabbing hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors touch-none z-50 relative`}
        >
            <div className="font-black text-indigo-600 dark:text-indigo-400 text-sm mb-1 truncate">{course.code || 'ไม่มีรหัส'}</div>
            <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 line-clamp-2 leading-tight flex-1">{course.title || 'ไม่มีชื่อ'}</div>
            <div className="mt-1 text-[10px] text-slate-500 font-bold self-start truncate w-full">
                {course.credits ? `${course.credits} นก.` : '0 นก.'} {course.hoursPerWeek ? `(${course.hoursPerWeek} คาบ)` : ''}
            </div>
        </div>
    );
};

const DragHandle = ({ id, data }: { id: string, data: any }) => {
    const { attributes, listeners, setNodeRef } = useDraggable({
        id,
        data
    });
    return (
        <button
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            className="px-1.5 py-1 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 cursor-grab active:cursor-grabbing touch-none transition-colors h-full flex items-center justify-center bg-slate-50 hover:bg-rose-50 dark:bg-white/5 dark:hover:bg-rose-500/10"
            title="ลากออกเพื่อลบ"
        >
            <GripVertical size={12} />
        </button>
    );
};

const TeacherDroppableTbody = ({ teacher, children }: { teacher: Teacher, children: React.ReactNode }) => {
    const { isOver, setNodeRef } = useDroppable({
        id: `teacher-${teacher.id}`,
        data: { type: 'teacher', teacherId: teacher.id }
    });

    return (
        <tbody 
            ref={setNodeRef} 
            className={`${isOver ? 'bg-indigo-50/80 dark:bg-indigo-500/10 ring-2 ring-indigo-500 ring-inset relative z-10' : ''}`}
        >
            {children}
        </tbody>
    );
};
// ----------------------
"""

import_anchor = 'import { getActiveSortedTeachers } from "@/utils/teacherSortUtils";'
if '// --- DND Components ---' not in content:
    content = content.replace(import_anchor, import_anchor + '\n' + dnd_imports_and_components)

# 3. Add internal state and handlers
internal_state_anchor = 'const [assignCoTeacherId, setAssignCoTeacherId] = useState<string>("");'
internal_state_code = """
    // --- DND States & Handlers ---
    const [activeDragItem, setActiveDragItem] = useState<any>(null);
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveDragItem(event.active.data.current);
    };

    const handleRemoveGroupInModalForDrag = async (courseId: string, groupNumber: number, isPending: boolean) => {
        if (isPending) {
            setPendingQueue(prev => prev.filter(p => !(p.courseId === courseId && p.groupNumber === groupNumber)));
            Swal.fire({ icon: 'success', title: 'ลบวิชาร่างเรียบร้อย', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
        } else {
            if (schoolId) {
                try {
                    const courseObj = coursesWithAssignments.find(c => c.id === courseId);
                    if (!courseObj) return;

                    const updated = (courseObj.teacherAssignments || []).filter((a: any) => a.groupNumber !== groupNumber);
                    const assignmentId = `${courseId}_${selectedYear}_${selectedSemester}`;
                    
                    await setDoc(doc(db, 'school-settings', schoolId, 'course_assignments', assignmentId), removeUndefinedFields({
                        courseId: courseId,
                        academicYear: selectedYear,
                        semester: selectedSemester,
                        teacherAssignments: updated
                    }), { merge: true });

                    setSemesterAssignments(prev => {
                        const idx = prev.findIndex(item => item.courseId === courseId);
                        const next = [...prev];
                        if (idx !== -1) {
                            next[idx] = { ...next[idx], teacherAssignments: updated };
                        }
                        return next;
                    });

                    Swal.fire({ icon: 'success', title: 'ลบข้อมูลจริงสำเร็จ', toast: true, position: 'top-end', timer: 1500, showConfirmButton: false });
                } catch (error) {
                    console.error("Failed to delete group assignment:", error);
                    Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาดในการลบ' });
                }
            }
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveDragItem(null);
        const { active, over } = event;

        if (!over && active.data.current?.type === 'assigned-group') {
            const { courseId, groupNumber, isPending } = active.data.current;
            const result = await Swal.fire({
                title: 'ลบรายวิชานี้?',
                text: `ต้องการลบกลุ่มที่ ${groupNumber} ออกจากครูผู้สอนใช่หรือไม่?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#ef4444',
                confirmButtonText: 'ลบออก',
                cancelButtonText: 'ยกเลิก',
                background: '#161a27',
                color: '#fff'
            });
            if (result.isConfirmed) {
                 handleRemoveGroupInModalForDrag(courseId, groupNumber, isPending);
            }
            return;
        }

        if (!over) return;

        if (active.data.current?.type === 'course' && over.data.current?.type === 'teacher') {
            const course = active.data.current.course;
            const teacherId = over.data.current.teacherId;
            
            const dbGroupsCount = course.teacherAssignments?.length || 0;
            const draftGroupsCount = pendingQueue.filter(p => p.courseId === course.id).length;
            const nextGroupNum = dbGroupsCount + draftGroupsCount + 1;
            
            const isAlreadyAssigned = (course.teacherAssignments || []).some((a: any) => a.groupNumber === nextGroupNum) ||
                                      pendingQueue.some(p => p.courseId === course.id && p.groupNumber === nextGroupNum);

            if (isAlreadyAssigned) {
                 Swal.fire({ icon: "warning", title: "กลุ่มการเรียนซ้ำซ้อน", text: `วิชานี้ถูกมอบหมายไปแล้ว โปรดจัดการในโหมดปกติ`, background: '#161a27', color: '#fff' });
                 return;
            }

            const newDraftItem = {
                courseId: course.id,
                teacherId: teacherId,
                teacherIds: [teacherId],
                roomIds: [],
                groupNumber: nextGroupNum,
                room: String(nextGroupNum),
                title: course.title,
                code: course.code,
                classId: course.classId || "m1",
            };

            setPendingQueue(prev => [...prev, newDraftItem]);
            Swal.fire({
                icon: 'success',
                title: 'มอบหมายสำเร็จ',
                text: `มอบหมายวิชา ${course.code} ให้ครูเรียบร้อย (ฉบับร่าง)`,
                toast: true,
                position: 'top-end',
                timer: 1500,
                showConfirmButton: false,
                background: '#161a27',
                color: '#fff'
            });
        }
    };
"""
if 'const [activeDragItem, setActiveDragItem] = useState<any>(null);' not in content:
    content = content.replace(internal_state_anchor, internal_state_anchor + '\n' + internal_state_code)


# 4. Wrap with DndContext
dnd_context_start = """
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <MainLayout>
"""
dnd_context_end = """
            </MainLayout>
            <DragOverlay dropAnimation={{ sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }) }}>
                {activeDragItem?.type === 'course' ? (
                    <DraggableCourseCard course={activeDragItem.course} />
                ) : activeDragItem?.type === 'assigned-group' ? (
                    <div className="bg-white dark:bg-[#161a27] p-3 rounded-lg shadow-2xl border-2 border-rose-500 font-black text-xs flex items-center gap-2 text-rose-600 dark:text-rose-400 z-[9999]">
                        <Trash2 size={16} />
                        ปล่อยเพื่อลบกลุ่ม {activeDragItem.groupNumber}
                    </div>
                ) : null}
            </DragOverlay>
        </DndContext>
"""

if '<DndContext' not in content:
    content = content.replace('<MainLayout>', dnd_context_start)
    content = content.replace('</MainLayout>', dnd_context_end)

# 5. Add Course Palette
palette_code = """
                    {/* Course Palette for Drag & Drop */}
                    <div className="mb-4 bg-white dark:bg-[#161a27] border border-slate-300 dark:border-white/10 rounded-xl p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-black text-slate-800 dark:text-white flex items-center gap-2">
                                <BookOpen size={16} className="text-indigo-500" />
                                รายวิชาที่สามารถมอบหมายได้ (ลากบล็อครายวิชาไปวางที่ครูผู้สอน)
                            </h3>
                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 dark:bg-white/5 px-2 py-1 rounded-md">
                                {assignableCourses.length} วิชา
                            </span>
                        </div>
                        {assignableCourses.length > 0 ? (
                            <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar snap-x">
                                {assignableCourses.map(course => (
                                    <div key={course.id} className="snap-start shrink-0">
                                        <DraggableCourseCard course={course} />
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs font-bold bg-slate-50 dark:bg-white/[0.02] rounded-lg border border-dashed border-slate-200 dark:border-white/10">
                                ไม่พบรายวิชาตามเงื่อนไขที่เลือก กรุณาเปลี่ยนตัวกรองด้านบน
                            </div>
                        )}
                    </div>
"""
main_anchor = '<main className="flex-1 px-4 lg:px-6 py-4 overflow-auto custom-scrollbar bg-slate-50 dark:bg-[#0b0e14]">'
if 'รายวิชาที่สามารถมอบหมายได้ (ลากบล็อครายวิชาไปวางที่ครูผู้สอน)' not in content:
    content = content.replace(main_anchor, main_anchor + '\n' + palette_code)

# 6. Change <React.Fragment key={teacher.id}> to <TeacherDroppableTbody key={teacher.id} teacher={teacher}>
if '<React.Fragment key={teacher.id}>' in content:
    content = content.replace('<React.Fragment key={teacher.id}>', '<TeacherDroppableTbody key={teacher.id} teacher={teacher}>')
    content = content.replace('</React.Fragment>', '</TeacherDroppableTbody>')

# 7. Update row.groups.map in table
old_group_map = """
                                                                            {row.groups.map(group => (
                                                                                <span key={`${row.course.id}-${group.groupNumber}-${group.room}`} className="text-center font-black text-slate-700 dark:text-slate-200">
                                                                                    {getLevelLabel(row.course.classId)}{group.room ? `/${group.room}` : ` กลุ่ม ${group.groupNumber}`}
                                                                                </span>
                                                                            ))}
"""
new_group_map = """
                                                                            {row.groups.map(group => (
                                                                                <div key={`${row.course.id}-${group.groupNumber}-${group.room}`} className="flex items-stretch justify-between bg-white dark:bg-[#0b0e14] border border-slate-200 dark:border-white/10 rounded overflow-hidden group/pill shadow-sm">
                                                                                    <span className="px-1.5 py-1 text-center font-black text-slate-700 dark:text-slate-200 text-[10px] flex-1 flex items-center justify-center">
                                                                                        {getLevelLabel(row.course.classId)}{group.room ? `/${group.room}` : ` ก.${group.groupNumber}`}
                                                                                    </span>
                                                                                    <div className="border-l border-slate-200 dark:border-white/10 shrink-0">
                                                                                        <DragHandle 
                                                                                            id={`assigned-${row.course.id}-${group.groupNumber}`} 
                                                                                            data={{ type: 'assigned-group', courseId: row.course.id, groupNumber: group.groupNumber, isPending: group.isPending }} 
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            ))}
"""
content = content.replace(old_group_map, new_group_map)

with open('/Users/nontawatsuwanabupha/BMS SmartSchool/src/pages/AcademicDepartment/CourseAssignmentPage2.tsx', 'w') as f:
    f.write(content)

print("Update completed successfully.")
