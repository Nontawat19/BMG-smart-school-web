import React, { useState, useEffect, useMemo } from 'react';
import Select from 'react-select'; // Import react-select
import {
    X, ChevronRight, ChevronLeft, ChevronDown, Save,
    BookOpen, Calculator, CalendarClock, Ban, LayoutGrid, Check,
    AlertCircle, Users, Search, Plus
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useSubjectGroups } from '@/hooks/useSubjectGroups';

// Reuse interfaces (ideally should be in a shared types file)
interface Course {
    id: string;
    title: string;
    code: string;
    classId?: string | string[];
    room?: string[];
    hoursPerWeek?: number;
    credits?: number; // Added credits
    teacherId?: string;
    type?: 'พื้นฐาน' | 'เพิ่มเติม';
    formativeWeight?: number;
    midtermWeight?: number;
    indicators?: string[];
    expectedOutcomes?: string[];
    constraints?: {
        disallowedDays?: string[];
        lockedSlots?: { day: string; periodId: string }[];
    };
    subjectGroup?: string;
    semester?: string;
    isCombined?: boolean;
    teacherIds?: string[];
    teacherAssignments?: { teacherId: string; roomIds: string[]; classLevels: string[] }[];
}

interface Teacher {
    id: string;
    teacherId?: string; // Added short code
    name: string;
    subjectGroup?: string;
}

interface EditCourseModalProps {
    isOpen: boolean;
    onClose: () => void;
    course: Course | null;
    onSave: (updatedCourse: Course) => Promise<void>;
    teachers: Teacher[];
    availableClassOptions: [string, string][];
    periodSettings: any[];
    schoolId?: string;
}



const DAYS_OF_WEEK: Record<string, string> = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

export const EditCourseModal: React.FC<EditCourseModalProps> = ({
    isOpen, onClose, course, onSave, teachers,
    availableClassOptions, periodSettings, schoolId
}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<Course | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Teacher Manager State
    const [isTeacherDropdownOpen, setIsTeacherDropdownOpen] = useState(false);
    const [teacherSearchTerm, setTeacherSearchTerm] = useState("");

    // Dark Mode Detection
    const [isDark, setIsDark] = useState(document.documentElement.classList.contains('dark'));
    useEffect(() => {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.attributeName === 'class') {
                    setIsDark(document.documentElement.classList.contains('dark'));
                }
            });
        });
        observer.observe(document.documentElement, { attributes: true });
        return () => observer.disconnect();
    }, []);

    const premiumStyles = {
        control: (base: any, state: any) => ({
            ...base,
            backgroundColor: isDark ? '#1e1f21' : '#f9fafb', // Match modal bg or slightly lighter
            borderColor: state.isFocused ? '#4f46e5' : isDark ? '#4b5563' : '#e5e7eb',
            borderRadius: '0.75rem', // rounded-xl
            padding: '2px',
            boxShadow: state.isFocused ? '0 0 0 2px rgba(79, 70, 229, 0.2)' : 'none',
            '&:hover': {
                borderColor: '#4f46e5',
            }
        }),
        menu: (base: any) => ({
            ...base,
            backgroundColor: isDark ? '#2a2b2f' : '#ffffff',
            border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            zIndex: 9999
        }),
        singleValue: (base: any) => ({
            ...base,
            color: isDark ? '#e5e7eb' : '#374151',
        }),
        input: (base: any) => ({
            ...base,
            color: isDark ? '#e5e7eb' : '#374151',
        }),
        option: (base: any, state: any) => ({
            ...base,
            backgroundColor: state.isSelected ? '#4f46e5' : state.isFocused ? (isDark ? '#374151' : '#f3f4f6') : 'transparent',
            color: state.isSelected ? 'white' : (isDark ? '#e5e7eb' : '#374151'),
            cursor: 'pointer',
            '&:active': {
                backgroundColor: '#4338ca',
            }
        }),
        menuPortal: (base: any) => ({ ...base, zIndex: 9999 })
    };

    // ดึงข้อมูลกลุ่มสาระจาก Firebase (อ้างอิง SubjectGroupManagementPage)
    const { subjectGroups } = useSubjectGroups(schoolId);
    const SUBJECT_GROUPS = useMemo(() => subjectGroups.map(g => g.name), [subjectGroups]);
    const subjectGroupOptions = useMemo(() =>
        subjectGroups.map(g => ({ value: g.name, label: g.name })),
        [subjectGroups]
    );
    const semesterOptions = [
        { value: '1', label: 'ภาคเรียนที่ 1' },
        { value: '2', label: 'ภาคเรียนที่ 2' }
    ];

    useEffect(() => {
        if (course) {
            // Deep copy constraints to avoid mutation issues
            const constraints = course.constraints ? {
                disallowedDays: [...(course.constraints.disallowedDays || [])],
                lockedSlots: [...(course.constraints.lockedSlots || [])]
            } : { disallowedDays: [], lockedSlots: [] };

            setFormData({
                ...course,
                constraints,
                classId: Array.isArray(course.classId) ? course.classId : (course.classId ? [course.classId] : []),
                room: course.room || [],
                indicators: course.indicators || [],
                expectedOutcomes: course.expectedOutcomes || [],
                subjectGroup: (() => {
                    const val = course.subjectGroup;
                    if (!val) return "";
                    const num = parseInt(val, 10);
                    if (!isNaN(num) && num >= 1 && num <= SUBJECT_GROUPS.length) {
                        return SUBJECT_GROUPS[num - 1];
                    }
                    return val;
                })(),
                semester: course.semester || "1", // Default to semester 1 if missing
                isCombined: course.isCombined || false,
                teacherAssignments: course.teacherAssignments || [],
                type: course.type || (course.expectedOutcomes?.length && !course.indicators?.length ? 'เพิ่มเติม' : 'พื้นฐาน')
            });
            setCurrentStep(1);
        }
    }, [course, isOpen]);

    if (!isOpen || !formData) return null;

    const handleChange = (field: keyof Course, value: any) => {
        setFormData(prev => prev ? { ...prev, [field]: value } : null);
    };

    const handleConstraintChange = (field: 'disallowedDays' | 'lockedSlots', value: any) => {
        setFormData(prev => {
            if (!prev) return null;
            return {
                ...prev,
                constraints: {
                    ...prev.constraints,
                    [field]: value
                }
            };
        });
    };

    const handleNext = () => {
        // Validation logic per step
        if (currentStep === 1) {
            if (!formData.title || !formData.code || !formData.teacherId) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ข้อมูลไม่ครบถ้วน',
                    text: 'กรุณากรอกชื่อวิชา, รหัสวิชา และเลือกครูผู้สอน',
                    confirmButtonColor: '#4f46e5'
                });
                return;
            }
        }
        setCurrentStep(prev => prev + 1);
    };

    const handleBack = () => setCurrentStep(prev => prev - 1);

    const handleSubmit = async () => {
        if (!formData) return;
        setIsSaving(true);
        try {
            const finalData = { ...formData };
            if (finalData.indicators) {
                finalData.indicators = finalData.indicators.map(i => i.trim()).filter(i => i.length > 0);
            }
            if (finalData.expectedOutcomes) {
                finalData.expectedOutcomes = finalData.expectedOutcomes.map(o => o.trim()).filter(o => o.length > 0);
            }
            await onSave(finalData);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setIsSaving(false);
        }
    };

    // Helper for rendering steps
    const renderStepIndicator = () => {
        const steps = [
            { num: 1, title: 'ข้อมูลทั่วไป', icon: <BookOpen size={16} /> },
            { num: 2, title: 'การวัดผล', icon: <Calculator size={16} /> },
            { num: 3, title: 'การจัดสอน', icon: <LayoutGrid size={16} /> },
            { num: 4, title: 'เงื่อนไข', icon: <CalendarClock size={16} /> },
        ];

        return (
            <div className="flex items-center justify-between mb-8 px-2">
                {steps.map((step, index) => (
                    <div
                        key={step.num}
                        onClick={() => setCurrentStep(step.num)}
                        className="flex flex-col items-center relative z-10 cursor-pointer group"
                    >
                        <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 group-hover:scale-110 ${currentStep >= step.num
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 group-hover:bg-gray-300 dark:group-hover:bg-gray-600'
                                }`}
                        >
                            {step.icon}
                        </div>
                        <span className={`text-[10px] sm:text-xs mt-2 font-medium transition-colors ${currentStep >= step.num
                            ? 'text-indigo-600 dark:text-indigo-400'
                            : 'text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300'
                            }`}>
                            {step.title}
                        </span>
                        {index < steps.length - 1 && (
                            <div className={`absolute top-5 left-1/2 w-full h-[2px] -z-10 transition-colors duration-300 ${currentStep > step.num ? 'bg-indigo-600' : 'bg-gray-200 dark:bg-gray-700'
                                }`} style={{ width: 'calc(100% * 2)' }} />
                        )}
                    </div>
                ))}
            </div>
        );
    };



    return (
        <>
            {/* renderTeacherManager removed */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
                <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <span className="bg-indigo-100 dark:bg-indigo-500/10 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                                    <BookOpen size={20} />
                                </span>
                                แก้ไขรายวิชา
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-11">
                                {formData.code} - {formData.title}
                            </p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                            <X size={24} />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        <style>{`
                            .scrollbar-hide::-webkit-scrollbar {
                                display: none;
                            }
                        `}</style>
                        {renderStepIndicator()}

                        <div className="min-h-[300px]">
                            {/* Inner Steps go here - already rendered in original code below */}
                            {/* We just need to ensure we don't duplicate the wrapper */}
                            {/* The original code continues from here... */}

                            {/* Step 1: General Info */}
                            {currentStep === 1 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อวิชา</label>
                                            <input
                                                type="text"
                                                value={formData.title}
                                                onChange={e => handleChange('title', e.target.value)}
                                                className="w-full bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-gray-900 dark:text-white shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700"
                                                placeholder="เช่น คณิตศาสตร์พื้นฐาน 1"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสวิชา</label>
                                            <input
                                                type="text"
                                                value={formData.code}
                                                onChange={e => handleChange('code', e.target.value)}
                                                className="w-full bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-gray-900 dark:text-white shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700"
                                                placeholder="เช่น ค11101"
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">กลุ่มสาระฯ</label>
                                            <div className="relative">
                                                <Select
                                                    value={subjectGroupOptions.find(opt => opt.value === formData.subjectGroup) || (formData.subjectGroup ? { label: formData.subjectGroup, value: formData.subjectGroup } : null)}
                                                    onChange={(opt: any) => handleChange('subjectGroup', opt?.value || '')}
                                                    options={subjectGroupOptions}
                                                    styles={premiumStyles}
                                                    placeholder="-- เลือกกลุ่มสาระ --"
                                                    menuPortalTarget={document.body} // Ensure it renders above modal
                                                    menuPosition="fixed"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ประเภทวิชา</label>
                                            <div className="flex gap-4">
                                                {['พื้นฐาน', 'เพิ่มเติม'].map(type => (
                                                    <label key={type} className={`
                          flex-1 relative flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                          ${formData.type === type
                                                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-bold'
                                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-200'}
                        `}>
                                                        <input
                                                            type="radio"
                                                            name="courseType"
                                                            className="sr-only"
                                                            checked={formData.type === type}
                                                            onChange={() => handleChange('type', type)}
                                                        />
                                                        {formData.type === type && <Check size={16} />}
                                                        {type}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="md:col-span-2">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ครูผู้สอน</label>

                                            {/* 1. Add Teacher (Standard React-Select) */}
                                            <div className="mb-4">
                                                <Select
                                                    placeholder="ค้นหาและเลือกครูผู้สอน..."
                                                    options={teachers
                                                        .filter(t => !(formData.teacherIds || []).includes(t.id))
                                                        .map(t => ({
                                                            value: t.id,
                                                            label: `${t.teacherId || t.id} ${t.name}${t.subjectGroup ? ` (${t.subjectGroup})` : ''}`,
                                                            teacher: t
                                                        }))
                                                    }
                                                    onChange={(option: any) => {
                                                        if (option && option.teacher) {
                                                            const teacher = option.teacher;
                                                            const currentIds = formData.teacherIds || [];
                                                            const currentAssignments = formData.teacherAssignments || [];
                                                            const newIds = [...currentIds, teacher.id];
                                                            const courseClasses = Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : []);
                                                            const newAssignments = [...currentAssignments, { teacherId: teacher.id, roomIds: formData.room || [], classLevels: courseClasses }];

                                                            handleChange('teacherIds', newIds);
                                                            if (newIds.length === 1) handleChange('teacherId', teacher.id);
                                                            handleChange('teacherAssignments', newAssignments);
                                                        }
                                                    }}
                                                    value={null} // Always clear after selection acting as a trigger
                                                    styles={{
                                                        ...premiumStyles,
                                                        control: (base: any, state: any) => ({
                                                            ...premiumStyles.control(base, state),
                                                            backgroundColor: isDark ? '#18181b' : '#ffffff',
                                                            border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
                                                        })
                                                    }}
                                                    menuPortalTarget={document.body}
                                                    menuPosition="fixed"
                                                    noOptionsMessage={() => "ไม่พบข้อมูล หรือเลือกครบแล้ว"}
                                                />
                                            </div>

                                            {/* 2. Selected Teachers Table (Standard) */}
                                            {(formData.teacherIds || []).length > 0 && (
                                                <details className="group mb-6 bg-white dark:bg-[#18181b] border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden" open>
                                                    <summary className="flex items-center justify-between px-4 py-3 bg-gray-50/50 dark:bg-white/5 cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-white/10 transition-colors list-none">
                                                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700 dark:text-gray-200">
                                                            <Users size={18} className="text-indigo-600 dark:text-indigo-400" />
                                                            รายชื่อครูที่เลือก ({formData.teacherIds?.length || 0})
                                                        </div>
                                                        <ChevronDown size={18} className="text-gray-400 transform group-open:rotate-180 transition-transform duration-200" />
                                                    </summary>

                                                    <div className="table-responsive border-t border-gray-200 dark:border-gray-700">
                                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                                            <thead className="bg-gray-50 dark:bg-[#2a2b2f]">
                                                                <tr>
                                                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[25%]">ครู</th>
                                                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[35%]">ระดับชั้น</th>
                                                                    <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[35%]">ห้อง</th>
                                                                    <th scope="col" className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-[5%]">ลบ</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="bg-white dark:bg-[#18181b] divide-y divide-gray-200 dark:divide-gray-700">
                                                                {teachers.filter(t => (formData.teacherIds || []).includes(t.id)).map((teacher, index) => {
                                                                    const assignment = (formData.teacherAssignments || []).find(a => a.teacherId === teacher.id);

                                                                    const courseClasses = Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : []);

                                                                    // Filter options: Show if it matches course grade OR if it's already selected by this teacher
                                                                    // If course has no specific grade set yet, show all options
                                                                    const classLevelOptions = availableClassOptions
                                                                        .filter(([val]) => {
                                                                            if (courseClasses.length === 0) return true;
                                                                            return courseClasses.includes(val) || (assignment?.classLevels || []).includes(val);
                                                                        })
                                                                        .map(([val, label]) => ({ value: val, label }));
                                                                    const roomOptions = Array.from({ length: 24 }, (_, i) => ({ value: String(i + 1), label: `ห้อง ${i + 1}` }));

                                                                    return (
                                                                        <tr key={teacher.id} className="hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                                <div className="flex items-center">
                                                                                    <div>
                                                                                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                                                                            <span className="font-mono text-indigo-600 dark:text-indigo-400 mr-2">{teacher.teacherId || teacher.id}</span>
                                                                                            {teacher.name}
                                                                                        </div>
                                                                                        {teacher.subjectGroup && (
                                                                                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
                                                                                                {teacher.subjectGroup}
                                                                                            </div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3">
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {courseClasses.length > 0 ? (
                                                                                        courseClasses.map((c: string) => (
                                                                                            <span key={c} className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/20">
                                                                                                {availableClassOptions.find(opt => opt[0] === c)?.[1] || c}
                                                                                            </span>
                                                                                        ))
                                                                                    ) : (
                                                                                        <span className="text-gray-400 text-xs italic">- ไม่ระบุ -</span>
                                                                                    )}
                                                                                </div>
                                                                            </td>
                                                                            <td className="px-4 py-3">
                                                                                <Select
                                                                                    isMulti
                                                                                    placeholder="เลือกห้อง..."
                                                                                    options={roomOptions}
                                                                                    value={roomOptions.filter(opt => assignment?.roomIds.includes(opt.value))}
                                                                                    onChange={(opts: any) => {
                                                                                        const newRooms = opts.map((o: any) => o.value);
                                                                                        const newAssignments = (formData.teacherAssignments || []).map(a =>
                                                                                            a.teacherId === teacher.id ? { ...a, roomIds: newRooms } : a
                                                                                        );
                                                                                        handleChange('teacherAssignments', newAssignments);
                                                                                    }}
                                                                                    styles={{
                                                                                        ...premiumStyles,
                                                                                        control: (base: any, state: any) => ({
                                                                                            ...premiumStyles.control(base, state),
                                                                                            minHeight: '30px',
                                                                                            fontSize: '0.75rem',
                                                                                            backgroundColor: 'transparent',
                                                                                            border: '1px solid ' + (isDark ? '#374151' : '#e5e7eb'),
                                                                                        }),
                                                                                        menu: (base: any) => ({ ...premiumStyles.menu(base), minWidth: '120px' })
                                                                                    }}
                                                                                    menuPortalTarget={document.body}
                                                                                    menuPosition="fixed"
                                                                                />
                                                                            </td>
                                                                            <td className="px-4 py-3 whitespace-nowrap text-center">
                                                                                <button
                                                                                    onClick={() => {
                                                                                        const newIds = (formData.teacherIds || []).filter(id => id !== teacher.id);
                                                                                        const newAssignments = (formData.teacherAssignments || []).filter(a => a.teacherId !== teacher.id);
                                                                                        handleChange('teacherIds', newIds);
                                                                                        if (newIds.length > 0 && !newIds.includes(formData.teacherId || '')) {
                                                                                            handleChange('teacherId', newIds[0]);
                                                                                        } else if (newIds.length === 0) {
                                                                                            handleChange('teacherId', '');
                                                                                        }
                                                                                        handleChange('teacherAssignments', newAssignments);
                                                                                    }}
                                                                                    className="text-gray-400 hover:text-red-600 transition-colors p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20"
                                                                                >
                                                                                    <X size={16} />
                                                                                </button>
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </details>
                                            )}
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ภาคเรียน</label>
                                            <div className="flex gap-4">
                                                {['1', '2'].map(term => (
                                                    <label key={term} className={`
                          flex-1 relative flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all
                          ${formData.semester === term
                                                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 font-bold'
                                                            : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:border-indigo-200'}
                        `}>
                                                        <input
                                                            type="radio"
                                                            name="semester"
                                                            className="sr-only"
                                                            checked={formData.semester === term}
                                                            onChange={() => handleChange('semester', term)}
                                                        />
                                                        {formData.semester === term && <Check size={16} />}
                                                        ภาคเรียนที่ {term}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Evaluation */}
                            {currentStep === 2 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div className="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-xl border border-indigo-100 dark:border-indigo-800">
                                        <h3 className="text-sm font-bold text-indigo-800 dark:text-indigo-300 mb-3 flex items-center gap-2">
                                            <Calculator size={18} /> สัดส่วนคะแนน (รวม 100 คะแนน)
                                        </h3>
                                        <div className="flex flex-col sm:flex-row items-center gap-4">
                                            <div className="flex-1 w-full">
                                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">คะแนนเก็บ</label>
                                                <input
                                                    type="number"
                                                    value={formData.formativeWeight || 0}
                                                    onChange={e => handleChange('formativeWeight', parseInt(e.target.value) || 0)}
                                                    className="w-full text-center bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-indigo-200 dark:border-indigo-700 rounded-lg px-3 py-2 text-lg font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 outline-none shadow-sm"
                                                />
                                            </div>
                                            <span className="text-gray-400 font-bold self-end sm:self-center mb-2 sm:mb-0">+</span>
                                            <div className="flex-1 w-full">
                                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">กลางภาค</label>
                                                <input
                                                    type="number"
                                                    value={formData.midtermWeight || 0}
                                                    onChange={e => handleChange('midtermWeight', parseInt(e.target.value) || 0)}
                                                    className="w-full text-center bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-indigo-200 dark:border-indigo-700 rounded-lg px-3 py-2 text-lg font-bold text-indigo-600 focus:ring-2 focus:ring-indigo-500/50 outline-none shadow-sm"
                                                />
                                            </div>
                                            <span className="text-gray-400 font-bold self-end sm:self-center mb-2 sm:mb-0">+</span>
                                            <div className="flex-1 w-full">
                                                <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">ปลายภาค (คำนวณอัตโนมัติ)</label>
                                                <input
                                                    type="number"
                                                    value={100 - (formData.formativeWeight || 0) - (formData.midtermWeight || 0)}
                                                    readOnly
                                                    className="w-full text-center bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-lg font-bold text-gray-500 focus:outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {formData.type === 'พื้นฐาน' ? (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                ตัวชี้วัด (Indicators)
                                                <span className="text-xs font-normal text-gray-500 ml-2">* แยกบรรทัดละ 1 ข้อ</span>
                                            </label>
                                            <div className="flex bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                                                <div className="bg-gray-100 dark:bg-gray-800 text-gray-400 p-3 text-right font-mono text-sm leading-relaxed select-none border-r border-gray-200 dark:border-gray-700 min-w-[3rem]">
                                                    {formData.indicators?.map((_, i) => <div key={i}>{i + 1}</div>)}
                                                    {!formData.indicators?.length && <div>1</div>}
                                                </div>
                                                <textarea
                                                    value={formData.indicators?.join('\n') || ''}
                                                    onChange={e => handleChange('indicators', e.target.value.split('\n'))}
                                                    rows={8}
                                                    className="flex-1 bg-transparent border-none p-3 focus:ring-0 resize-y text-gray-900 dark:text-white text-sm leading-relaxed"
                                                    placeholder="ว 1.1 ป.1/1 ระบุชื่อพืช..."
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                ผลการเรียนรู้ (Expected Outcomes)
                                                <span className="text-xs font-normal text-gray-500 ml-2">* แยกบรรทัดละ 1 ข้อ</span>
                                            </label>
                                            <div className="flex bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500/50 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                                                <div className="bg-gray-100 dark:bg-gray-800 text-gray-400 p-3 text-right font-mono text-sm leading-relaxed select-none border-r border-gray-200 dark:border-gray-700 min-w-[3rem]">
                                                    {formData.expectedOutcomes?.map((_, i) => <div key={i}>{i + 1}</div>)}
                                                    {!formData.expectedOutcomes?.length && <div>1</div>}
                                                </div>
                                                <textarea
                                                    value={formData.expectedOutcomes?.join('\n') || ''}
                                                    onChange={e => handleChange('expectedOutcomes', e.target.value.split('\n'))}
                                                    rows={8}
                                                    className="flex-1 bg-transparent border-none p-3 focus:ring-0 resize-y text-gray-900 dark:text-white text-sm leading-relaxed"
                                                    placeholder="1. เข้าใจหลักการ..."
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step 3: Scheduling */}
                            {currentStep === 3 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">ระดับชั้นที่เปิดสอน</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-48 overflow-y-auto custom-scrollbar p-1">
                                            {availableClassOptions.map(([key, name]) => (
                                                <label key={key} className={`
                                    cursor-pointer flex items-center justify-between p-3 rounded-lg border transition-all
                                    ${(Array.isArray(formData.classId) ? formData.classId.includes(key) : formData.classId === key)
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                        : 'bg-gray-50 dark:bg-[#2a2b2f] border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-indigo-300'}
                                `}>
                                                    <span className="text-xs font-semibold">{name}</span>
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={(Array.isArray(formData.classId) ? formData.classId.includes(key) : formData.classId === key)}
                                                        onChange={() => {
                                                            const current = Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : []);
                                                            let next;
                                                            if (current.includes(key)) {
                                                                next = current.filter(c => c !== key);
                                                            } else {
                                                                next = [...current, key];
                                                            }
                                                            handleChange('classId', next);

                                                            // Sync teacher assignments
                                                            const newAssignments = (formData.teacherAssignments || []).map(a => ({
                                                                ...a,
                                                                classLevels: next
                                                            }));
                                                            handleChange('teacherAssignments', newAssignments);
                                                        }}
                                                    />
                                                    {(Array.isArray(formData.classId) ? formData.classId.includes(key) : formData.classId === key) && <Check size={14} />}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">ห้องเรียน</label>
                                        <div className="flex flex-wrap gap-2">
                                            {Array.from({ length: 24 }, (_, i) => String(i + 1)).map(r => (
                                                <label key={r} className={`
                                    cursor-pointer w-10 h-10 flex items-center justify-center rounded-lg border transition-all font-bold text-sm
                                    ${formData.room?.includes(r)
                                                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                                                        : 'bg-gray-50 dark:bg-[#2a2b2f] border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-indigo-300'}
                                `}>
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={formData.room?.includes(r)}
                                                        onChange={() => {
                                                            const current = formData.room || [];
                                                            let next;
                                                            if (current.includes(r)) {
                                                                next = current.filter(room => room !== r);
                                                            } else {
                                                                next = [...current, r];
                                                            }
                                                            handleChange('room', next);

                                                            // Sync teacher assignments
                                                            const newAssignments = (formData.teacherAssignments || []).map(a => ({
                                                                ...a,
                                                                roomIds: next
                                                            }));
                                                            handleChange('teacherAssignments', newAssignments);
                                                        }}
                                                    />
                                                    {r}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">หน่วยกิต</label>
                                                <input
                                                    type="number"
                                                    min="0.5"
                                                    step="0.5"
                                                    value={formData.credits || 1.0}
                                                    onChange={e => {
                                                        const val = parseFloat(e.target.value) || 0;
                                                        handleChange('credits', val);
                                                        handleChange('hoursPerWeek', Math.max(1, Math.round(val * 2)));
                                                    }}
                                                    className="w-full bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-gray-900 dark:text-white shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">จำนวนคาบ/สัปดาห์</label>
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={formData.hoursPerWeek || 2}
                                                    onChange={e => handleChange('hoursPerWeek', parseInt(e.target.value) || 1)}
                                                    className="w-full bg-white/50 dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500/50 outline-none transition-all text-gray-900 dark:text-white shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700"
                                                />
                                            </div>
                                        </div>
                                        <div className="flex flex-col justify-end pb-2 gap-4">
                                            <label className="flex items-center gap-3 cursor-pointer p-4 bg-white/50 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 hover:border-amber-300 hover:shadow-md transition-all group">
                                                <div className={`relative w-12 h-6 rounded-full p-1 transition-all duration-300 ${formData.isCombined ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`}>
                                                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300 ${formData.isCombined ? 'translate-x-6' : ''}`} />
                                                </div>
                                                <div>
                                                    <span className={`text-sm font-bold block ${formData.isCombined ? 'text-amber-600' : 'text-gray-700 dark:text-gray-300'}`}>โหมดสอนรวมห้อง</span>
                                                    <span className="text-[10px] text-gray-400">อนุญาตให้ระบุชั้นและห้องเรียนหลายรายการต่อคน</span>
                                                </div>
                                                <input
                                                    type="checkbox"
                                                    className="sr-only"
                                                    checked={formData.isCombined || false}
                                                    onChange={e => handleChange('isCombined', e.target.checked)}
                                                />
                                            </label>
                                        </div>
                                    </div>

                                    <div className="md:col-span-2">
                                        {/* Removed Special Program check */}
                                    </div>
                                </div>
                            )}

                            {/* Step 4: Constraints */}
                            {currentStep === 4 && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                                            <Ban size={16} className="text-red-500" />
                                            เงื่อนไขการวันสอน (วันที่ไม่สะดวก)
                                        </label>
                                        <div className="flex gap-3 flex-wrap">
                                            {Object.entries(DAYS_OF_WEEK).map(([key, name]) => (
                                                <label key={key} className={`
                                    cursor-pointer px-4 py-2 rounded-full border-2 transition-all flex items-center gap-2 text-sm
                                    ${formData.constraints?.disallowedDays?.includes(key)
                                                        ? 'bg-red-500 border-red-500 text-white shadow-md'
                                                        : 'bg-transparent border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-red-300 hover:text-red-500'}
                                `}>
                                                    <input
                                                        type="checkbox"
                                                        className="sr-only"
                                                        checked={formData.constraints?.disallowedDays?.includes(key) || false}
                                                        onChange={() => {
                                                            const current = formData.constraints?.disallowedDays || [];
                                                            if (current.includes(key)) {
                                                                handleConstraintChange('disallowedDays', current.filter(d => d !== key));
                                                            } else {
                                                                handleConstraintChange('disallowedDays', [...current, key]);
                                                            }
                                                        }}
                                                    />
                                                    {name}
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                                            <LayoutGrid size={16} className="text-emerald-500" />
                                            ยึดคาบสอน (Lock Slot)
                                            <span className="text-xs font-normal text-gray-500">(เลือกเฉพาะคาบที่ต้องการสอนแน่นอน)</span>
                                        </label>
                                        <div className="table-responsive bg-white/50 dark:bg-white/5 backdrop-blur-sm rounded-xl border border-gray-200 dark:border-gray-700 p-2 shadow-inner custom-scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                                            <style>{`
                                            .custom-scrollbar-hide::-webkit-scrollbar {
                                                display: none;
                                            }
                                        `}</style>
                                            <table className="w-full text-[10px] border-collapse">
                                                <thead>
                                                    <tr>
                                                        <th className="p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f] text-gray-400 text-left min-w-[80px]">คาบ / วัน</th>
                                                        {Object.keys(DAYS_OF_WEEK).map((key) => (
                                                            <th key={key} className="p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f] text-gray-500 dark:text-gray-300 font-bold text-center">
                                                                {DAYS_OF_WEEK[key]}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {periodSettings.map(p => (
                                                        <tr key={p.id}>
                                                            <td className="p-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#2a2b2f] text-gray-500 font-medium">
                                                                <div className="flex flex-col">
                                                                    <span>{p.label}</span>
                                                                    <span className="text-[9px] text-gray-400">{p.startTime}-{p.endTime}</span>
                                                                </div>
                                                            </td>
                                                            {Object.keys(DAYS_OF_WEEK).map((dayKey) => {
                                                                const isLocked = formData.constraints?.lockedSlots?.some(s => s.day === dayKey && s.periodId === p.id);
                                                                return (
                                                                    <td key={dayKey} className="border border-gray-200 dark:border-gray-700 p-0">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => {
                                                                                const currentLocked = formData.constraints?.lockedSlots || [];
                                                                                let newLocked;
                                                                                if (isLocked) {
                                                                                    newLocked = currentLocked.filter(s => !(s.day === dayKey && s.periodId === p.id));
                                                                                } else {
                                                                                    // Check total hours limit
                                                                                    if (currentLocked.length >= (formData.hoursPerWeek || 0)) {
                                                                                        Swal.fire({
                                                                                            toast: true, position: 'top', icon: 'error',
                                                                                            title: `ล็อคครบ ${formData.hoursPerWeek} คาบแล้ว`,
                                                                                            showConfirmButton: false, timer: 1500
                                                                                        });
                                                                                        return;
                                                                                    }
                                                                                    newLocked = [...currentLocked, { day: dayKey, periodId: p.id }];
                                                                                }
                                                                                handleConstraintChange('lockedSlots', newLocked);
                                                                            }}
                                                                            className={`w-full h-12 flex items-center justify-center transition-all duration-200 ${isLocked
                                                                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-inner'
                                                                                : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-transparent hover:text-gray-300'
                                                                                }`}
                                                                        >
                                                                            {isLocked ? <Check size={16} /> : <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" />}
                                                                        </button>
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-[#18181b]/80 backdrop-blur-md flex justify-between items-center rounded-b-2xl">
                        <button
                            onClick={currentStep === 1 ? onClose : handleBack}
                            disabled={isSaving}
                            className="px-6 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
                        >
                            {currentStep === 1 ? 'ยกเลิก' : <><ChevronLeft size={18} /> ย้อนกลับ</>}
                        </button>

                        {currentStep < 4 ? (
                            <button
                                onClick={handleNext}
                                className="px-6 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 hover:shadow-xl transition-all flex items-center gap-2"
                            >
                                ถัดไป <ChevronRight size={18} />
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmit}
                                disabled={isSaving}
                                className={`
                        px-8 py-2.5 rounded-xl text-white font-semibold shadow-lg transition-all flex items-center gap-2
                        ${isSaving
                                        ? 'bg-gray-400 cursor-not-allowed'
                                        : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 dark:shadow-emerald-900/20 hover:shadow-xl hover:-translate-y-0.5'}
                    `}
                            >
                                {isSaving ? (
                                    <>กำลังบันทึก...</>
                                ) : (
                                    <><Save size={18} /> บันทึกข้อมูล</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};
