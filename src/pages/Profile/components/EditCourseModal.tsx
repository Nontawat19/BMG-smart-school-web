import React, { useState, useEffect, useMemo } from 'react';
import Select from 'react-select';
import {
    X, ChevronRight, ChevronLeft, BookOpen, Calculator, Ban, LayoutGrid, Check, ListChecks
} from 'lucide-react';
import Swal from 'sweetalert2';
import { useSubjectGroups } from '@/hooks/useSubjectGroups';

interface Course {
    id: string;
    title: string;
    code: string;
    classId?: string | string[];
    room?: string[];
    hoursPerWeek?: number;
    credits?: number | string;
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
    teacherId?: string;
    name: string;
    subjectGroup?: string;
    uid?: string;
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
            backgroundColor: isDark ? '#1e1f21' : '#f9fafb',
            borderColor: state.isFocused ? '#4f46e5' : isDark ? '#4b5563' : '#e5e7eb',
            borderRadius: '0.75rem',
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

    const { subjectGroups } = useSubjectGroups(schoolId);
    const SUBJECT_GROUPS = useMemo(() => subjectGroups.map(g => g.name), [subjectGroups]);
    const subjectGroupOptions = useMemo(() =>
        subjectGroups.map(g => ({ value: g.name, label: g.name })),
        [subjectGroups]
    );

    useEffect(() => {
        if (isOpen && course) {
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
                    // Use a more stable way to check subject groups if needed, 
                    // but for initialization, just use the value
                    if (!isNaN(num) && num >= 1 && num <= SUBJECT_GROUPS.length) {
                        return SUBJECT_GROUPS[num - 1];
                    }
                    return val;
                })(),
                semester: course.semester || "1",
                isCombined: course.isCombined || false,
                teacherAssignments: course.teacherAssignments || [],
                type: course.type || (course.expectedOutcomes?.length && !course.indicators?.length ? 'เพิ่มเติม' : 'พื้นฐาน'),
                credits: (course.credits && Number(course.credits) > 0) ? String(course.credits) : (course.hoursPerWeek && Number(course.hoursPerWeek) > 0 ? String(course.hoursPerWeek / 2) : "0"),
                hoursPerWeek: (course.hoursPerWeek && Number(course.hoursPerWeek) > 0) ? course.hoursPerWeek : (course.credits && Number(course.credits) > 0 ? Math.round(parseFloat(String(course.credits)) * 2) : 0),
            });
            setCurrentStep(1);
        }
    }, [course?.id, isOpen]);

    if (!isOpen || !formData) return null;

    const handleChange = (field: keyof Course, value: any) => {
        setFormData(prev => prev ? { ...prev, [field]: value } : null);
    };



    const handleNext = () => {
        if (currentStep === 1) {
            if (!formData.title || !formData.code || !formData.teacherId) {
                Swal.fire({
                    icon: 'warning',
                    title: 'ข้อมูลไม่ครบถ้วน',
                    text: 'กรุณากรอกชื่อวิชาและรหัสวิชา',
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

    const renderStepIndicator = () => {
        const steps = [
            { num: 1, title: 'ข้อมูลทั่วไป', icon: <BookOpen size={16} /> },
            { num: 2, title: 'สัดส่วนคะแนน', icon: <Calculator size={16} /> },
            { num: 3, title: 'ตัวชี้วัด', icon: <ListChecks size={16} /> },
            { num: 4, title: 'การจัดสอน', icon: <LayoutGrid size={16} /> },
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="bg-indigo-100 dark:bg-indigo-500/10 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                                <BookOpen size={20} />
                            </span>
                            แก้ไขข้อมูลรายวิชา (Profile)
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-11">
                            {formData.code} - {formData.title}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-gray-700 hover:scrollbar-thumb-indigo-500/50">
                    {renderStepIndicator()}

                    <div className="min-h-[300px]">
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ชื่อวิชา (อ่านอย่างเดียว)</label>
                                        <div className="w-full bg-gray-100/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                                            {formData.title}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">รหัสวิชา (อ่านอย่างเดียว)</label>
                                        <div className="w-full bg-gray-100/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                                            {formData.code}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">กลุ่มสาระฯ (อ่านอย่างเดียว)</label>
                                        <div className="w-full bg-gray-100/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                                            {formData.subjectGroup || "-"}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ประเภทวิชา (อ่านอย่างเดียว)</label>
                                        <div className="w-full bg-gray-100/50 dark:bg-white/5 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                                            วิชา{formData.type}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">ผู้สอนรายวิชา (ตรวจสอบข้อมูลเท่านั้น)</h3>
                                    <div className="bg-white dark:bg-[#18181b] border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-50 dark:bg-[#2a2b2f]">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ครู</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">ระดับชั้นและห้อง</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {(() => {
                                                    const tArray = Array.isArray(teachers) ? teachers : [];
                                                    const assignmentMap = new Map<string, any>();

                                                    // 1. Collect detailed assignments
                                                    if (Array.isArray(formData.teacherAssignments)) {
                                                        formData.teacherAssignments.forEach(a => {
                                                            if (a.teacherId) assignmentMap.set(a.teacherId, { ...a });
                                                        });
                                                    }

                                                    // 2. Collect from teacherIds list
                                                    if (Array.isArray(formData.teacherIds)) {
                                                        formData.teacherIds.forEach(id => {
                                                            if (id && !assignmentMap.has(id)) {
                                                                assignmentMap.set(id, {
                                                                    teacherId: id,
                                                                    roomIds: formData.room || [],
                                                                    classLevels: Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : [])
                                                                });
                                                            }
                                                        });
                                                    }

                                                    // 3. Add primary teacherId if missing
                                                    if (formData.teacherId && !assignmentMap.has(formData.teacherId)) {
                                                        assignmentMap.set(formData.teacherId, {
                                                            teacherId: formData.teacherId,
                                                            roomIds: formData.room || [],
                                                            classLevels: Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : [])
                                                        });
                                                    }

                                                    const assignments = Array.from(assignmentMap.values());

                                                    if (assignments.length === 0) {
                                                        return (
                                                            <tr>
                                                                <td colSpan={2} className="px-4 py-10 text-center text-sm text-gray-400 italic">
                                                                    ไม่พบข้อมูลการมอบหมายผู้สอน
                                                                </td>
                                                            </tr>
                                                        );
                                                    }

                                                    return assignments.map((assign, idx) => {
                                                        const teacher = tArray.find(t =>
                                                            t.id === assign.teacherId ||
                                                            t.teacherId === assign.teacherId ||
                                                            t.uid === assign.teacherId
                                                        );

                                                        const classLevels = (Array.isArray(assign.classLevels) && assign.classLevels.length > 0)
                                                            ? assign.classLevels
                                                            : (Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : []));

                                                        const rooms = (Array.isArray(assign.roomIds) && assign.roomIds.length > 0)
                                                            ? assign.roomIds
                                                            : (formData.room || []);

                                                        return (
                                                            <tr key={assign.teacherId || idx} className="bg-white dark:bg-[#18181b] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                                                                <td className="px-4 py-4">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                                                            {teacher?.name || `อาจารย์ผู้สอน (รหัส: ${assign.teacherId})`}
                                                                        </span>
                                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold mt-1 tracking-wider uppercase">
                                                                            ID: {teacher?.teacherId || assign.teacherId || "-"}
                                                                        </span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-4 py-4">
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {(() => {
                                                                            let badges: string[] = [];
                                                                            if (classLevels.length > 0 && rooms.length > 0) {
                                                                                classLevels.forEach((cl: string) => {
                                                                                    const className = availableClassOptions.find(opt => String(opt[0]) === String(cl))?.[1] || cl;
                                                                                    rooms.forEach((r: string) => {
                                                                                        badges.push(`${className}/${r}`);
                                                                                    });
                                                                                });
                                                                            }

                                                                            if (badges.length > 0) {
                                                                                return (
                                                                                    <>
                                                                                        <span className="px-2 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-[10px] font-black border border-indigo-100 dark:border-indigo-500/30">
                                                                                            {badges[0]}
                                                                                        </span>
                                                                                        {badges.length > 1 && (
                                                                                            <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 self-center">
                                                                                                และห้องอื่นๆอีก {badges.length - 1} ห้อง
                                                                                            </span>
                                                                                        )}
                                                                                    </>
                                                                                );
                                                                            }

                                                                            return (
                                                                                <>
                                                                                    {classLevels.map((cl: string) => (
                                                                                        <span key={cl} className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black border border-emerald-100 dark:border-emerald-500/20">
                                                                                            {availableClassOptions.find(opt => String(opt[0]) === String(cl))?.[1] || cl}
                                                                                        </span>
                                                                                    ))}
                                                                                    {rooms.map((r: string) => (
                                                                                        <span key={r} className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black shadow-sm">
                                                                                            ห้อง {r}
                                                                                        </span>
                                                                                    ))}
                                                                                    {classLevels.length === 0 && rooms.length === 0 && (
                                                                                        <span className="text-[10px] text-gray-400 italic">ไม่ระบุข้อมูลห้องเรียน</span>
                                                                                    )}
                                                                                </>
                                                                            );
                                                                        })()}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="bg-indigo-50 dark:bg-indigo-900/10 p-6 rounded-2xl border border-indigo-100 dark:border-indigo-800 shadow-sm">
                                    <h3 className="text-base font-bold text-indigo-800 dark:text-indigo-300 mb-6 flex items-center gap-3">
                                        <div className="bg-white dark:bg-indigo-500/20 p-2 rounded-lg shadow-sm">
                                            <Calculator size={20} />
                                        </div>
                                        สัดส่วนคะแนน (ต้องรวมได้ 100 คะแนน)
                                    </h3>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-600 dark:text-gray-400">คะแนนเก็บ</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={formData.formativeWeight || 0}
                                                    onChange={e => handleChange('formativeWeight', parseInt(e.target.value) || 0)}
                                                    className="w-full text-center bg-white dark:bg-white/5 border-2 border-indigo-100 dark:border-indigo-500/20 rounded-xl py-3 text-xl font-black text-indigo-600 dark:text-indigo-400 focus:border-indigo-500 outline-none transition-all"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-600 dark:text-gray-400">กลางภาค</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={formData.midtermWeight || 0}
                                                    onChange={e => handleChange('midtermWeight', parseInt(e.target.value) || 0)}
                                                    className="w-full text-center bg-white dark:bg-white/5 border-2 border-indigo-100 dark:border-indigo-500/20 rounded-xl py-3 text-xl font-black text-indigo-600 dark:text-indigo-400 focus:border-indigo-500 outline-none transition-all"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-bold text-gray-600 dark:text-gray-400">ปลายภาค</label>
                                            <div className="relative">
                                                <input
                                                    type="number"
                                                    value={100 - (formData.formativeWeight || 0) - (formData.midtermWeight || 0)}
                                                    readOnly
                                                    className="w-full text-center bg-gray-50 dark:bg-gray-800/50 border-2 border-gray-100 dark:border-gray-700 rounded-xl py-3 text-xl font-black text-gray-400 outline-none cursor-not-allowed"
                                                />
                                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400">%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-6 flex items-center gap-2 p-3 bg-white/50 dark:bg-white/5 rounded-xl border border-dashed border-indigo-200 dark:border-indigo-500/30">
                                        <div className={`w-3 h-3 rounded-full ${(formData.formativeWeight || 0) + (formData.midtermWeight || 0) + (100 - (formData.formativeWeight || 0) - (formData.midtermWeight || 0)) === 100 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                                        <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                                            ผลรวมคะแนนทั้งหมด: 100% (คำนวณอัตโนมัติ)
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="bg-white dark:bg-white/5 p-1 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm relative">
                                    <div className="p-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/95 dark:bg-[#1e1f21] backdrop-blur-md flex items-center justify-between sticky -top-6 z-10 -mx-1 -mt-1 rounded-t-2xl shadow-sm">
                                        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                            <ListChecks size={18} className="text-indigo-500" />
                                            {formData.type === 'พื้นฐาน' ? 'รายการตัวชี้วัด (Indicators)' : 'ผลการเรียนรู้ที่คาดหวัง (Expected Outcomes)'}
                                        </h3>
                                        <span className="text-[10px] font-bold px-2 py-1 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-lg">
                                            วิชา{formData.type}
                                        </span>
                                    </div>
                                    <div className="flex min-h-[400px]">
                                        <div className="bg-gray-50 dark:bg-gray-800/50 text-gray-400 p-4 text-right font-mono text-xs leading-relaxed select-none border-r border-gray-100 dark:border-gray-700 min-w-[3.5rem]">
                                            {(formData.type === 'พื้นฐาน' ? formData.indicators : formData.expectedOutcomes)?.map((_, i) => <div key={i} className="h-6 flex items-center justify-end">{i + 1}</div>)}
                                            {!(formData.type === 'พื้นฐาน' ? formData.indicators : formData.expectedOutcomes)?.length && <div className="h-6 flex items-center justify-end">1</div>}
                                        </div>
                                        <textarea
                                            value={(formData.type === 'พื้นฐาน' ? formData.indicators : formData.expectedOutcomes)?.join('\n') || ''}
                                            onChange={e => handleChange(formData.type === 'พื้นฐาน' ? 'indicators' : 'expectedOutcomes', e.target.value.split('\n'))}
                                            className="flex-1 bg-transparent border-none p-4 focus:ring-0 resize-none text-gray-900 dark:text-white text-sm outline-none font-medium leading-relaxed"
                                            placeholder="กรุณาพิมพ์ข้อความแต่ละข้อแยกบรรทัดกัน..."
                                        />
                                    </div>
                                    <div className="p-3 bg-gray-50/50 dark:bg-white/5 border-t border-gray-100 dark:border-gray-700 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                        <p className="text-[10px] text-gray-500 dark:text-gray-400 italic">
                                            * กด Enter เพื่อเพิ่มข้อใหม่ (ระบบจะนับจำนวนข้อให้อัตโนมัติทางด้านซ้าย)
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">หน่วยกิต (Credits) - อ่านอย่างเดียว</label>
                                        <div className="flex items-center gap-4 bg-gray-100/50 dark:bg-white/10 p-2 rounded-xl border-2 border-gray-100 dark:border-gray-700/50 opacity-80">
                                            <div className="w-full bg-transparent text-center text-xl font-black text-gray-500 dark:text-gray-400">
                                                {formData.credits || 0}
                                            </div>
                                            <span className="text-xs font-bold text-gray-400 pr-4">นก.</span>
                                        </div>
                                    </div>
                                    <div className="bg-white dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm transition-all">
                                        <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-4">คาบ/สัปดาห์ (Hours) - อ่านอย่างเดียว</label>
                                        <div className="flex items-center gap-4 bg-gray-100/50 dark:bg-white/10 p-2 rounded-xl border-2 border-gray-100 dark:border-gray-700/50 opacity-80">
                                            <div className="w-full bg-transparent text-center text-xl font-black text-gray-500 dark:text-gray-400">
                                                {formData.hoursPerWeek || 0}
                                            </div>
                                            <span className="text-xs font-bold text-gray-400 pr-4">คาบ</span>
                                        </div>
                                    </div>
                                </div>
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl">
                                    <p className="text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                        <Ban size={14} /> หมายเหตุ: ข้อมูลหน่วยกิตและคาบเรียนถูกกำหนดโดยงานวิชาการ ไม่สามารถแก้ไขได้ในส่วนนี้
                                    </p>
                                </div>
                            </div>
                        )}


                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-between bg-gray-50/50 dark:bg-white/5 rounded-b-2xl">
                    <button
                        onClick={currentStep === 1 ? onClose : handleBack}
                        disabled={isSaving}
                        className="px-6 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 transition-colors"
                    >
                        {currentStep === 1 ? 'ยกเลิก' : 'ย้อนกลับ'}
                    </button>
                    <div className="flex gap-3">
                        {currentStep < 4 ? (
                            <button onClick={handleNext} className="px-8 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-lg">
                                ขั้นตอนถัดไป <ChevronRight size={16} className="inline ml-1" />
                            </button>
                        ) : (
                            <button onClick={handleSubmit} disabled={isSaving} className={`px-8 py-2 rounded-xl text-white font-bold ${isSaving ? 'bg-gray-400' : 'bg-emerald-600 hover:bg-emerald-700'}`}>
                                {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
