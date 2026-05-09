import React, { useState, useEffect, useMemo } from 'react';

import {
    X, ChevronRight, ChevronLeft, ChevronDown,
    BookOpen, Calculator, CalendarClock, Ban, LayoutGrid, Check,
    AlertCircle, Users, Search
} from 'lucide-react';
import { useSubjectGroups } from '@/hooks/useSubjectGroups';

interface Course {
    id: string;
    title: string;
    code: string;
    classId?: string | string[];
    room?: string[];
    hoursPerWeek?: number;
    credits?: number;
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
}

interface ViewCourseDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    course: Course | null;
    teachers: Teacher[];
    availableClassOptions: [string, string][];
    periodSettings: any[];
    schoolId?: string;
}

const DAYS_OF_WEEK: Record<string, string> = { mon: 'จันทร์', tue: 'อังคาร', wed: 'พุธ', thu: 'พฤหัสบดี', fri: 'ศุกร์' };

export const ViewCourseDetailModal: React.FC<ViewCourseDetailModalProps> = ({
    isOpen, onClose, course, teachers,
    availableClassOptions, periodSettings, schoolId
}) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [formData, setFormData] = useState<Course | null>(null);
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

    const { subjectGroups } = useSubjectGroups(schoolId);
    const SUBJECT_GROUPS = useMemo(() => subjectGroups.map(g => g.name), [subjectGroups]);

    useEffect(() => {
        if (course) {
            setFormData({
                ...course,
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
                semester: course.semester || "1",
                isCombined: course.isCombined || false,
                teacherAssignments: course.teacherAssignments || [],
                type: course.type || (course.expectedOutcomes?.length && !course.indicators?.length ? 'เพิ่มเติม' : 'พื้นฐาน')
            });
            setCurrentStep(1);
        }
    }, [course, isOpen, SUBJECT_GROUPS]);

    if (!isOpen || !formData) return null;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-100 dark:border-gray-800">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <span className="bg-indigo-100 dark:bg-indigo-500/10 p-2 rounded-lg text-indigo-600 dark:text-indigo-400">
                                <BookOpen size={20} />
                            </span>
                            รายละเอียดรายวิชา (อ่านอย่างเดียว)
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-11">
                            {formData.code} - {formData.title}
                        </p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
                    {renderStepIndicator()}

                    <div className="min-h-[300px]">
                        {currentStep === 1 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">ชื่อวิชา</label>
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800">
                                            {formData.title}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">รหัสวิชา</label>
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800">
                                            {formData.code}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">กลุ่มสาระฯ</label>
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800">
                                            {formData.subjectGroup || "-"}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">ประเภทวิชา</label>
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800">
                                            {formData.type}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-3">รายชื่อครูและห้องเรียนที่มอบหมาย</label>
                                    <div className="bg-white dark:bg-[#18181b] border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm overflow-hidden">
                                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                            <thead className="bg-gray-50 dark:bg-[#2a2b2f]">
                                                <tr>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ครู</th>
                                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">ระดับชั้นและห้องเรียน</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                                {teachers.filter(t => (formData.teacherIds || []).includes(t.id)).map((teacher) => {
                                                    const assignment = (formData.teacherAssignments || []).find(a => a.teacherId === teacher.id);
                                                    const courseClasses = Array.isArray(formData.classId) ? formData.classId : (formData.classId ? [formData.classId] : []);
                                                    const rooms = assignment?.roomIds || [];
                                                    return (
                                                        <tr key={teacher.id}>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                                    <span className="font-mono text-indigo-600 dark:text-indigo-400 mr-2">{teacher.teacherId || teacher.id}</span>
                                                                    {teacher.name}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 border-l border-gray-100 dark:border-gray-800">
                                                                <div className="flex flex-wrap gap-2">
                                                                    {(() => {
                                                                        let badges: string[] = [];
                                                                        if (courseClasses.length > 0 && rooms.length > 0) {
                                                                            courseClasses.forEach(cl => {
                                                                                const className = availableClassOptions.find(opt => String(opt[0]) === String(cl))?.[1] || cl;
                                                                                rooms.forEach(r => {
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
                                                                                {courseClasses.map(c => (
                                                                                    <span key={c} className="px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-black border border-emerald-100 dark:border-emerald-500/20">
                                                                                        {availableClassOptions.find(opt => String(opt[0]) === String(c))?.[1] || c}
                                                                                    </span>
                                                                                ))}
                                                                                {rooms.map(room => (
                                                                                    <span key={room} className="px-2 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-black shadow-sm">
                                                                                        ห้อง {room}
                                                                                    </span>
                                                                                ))}
                                                                                {courseClasses.length === 0 && rooms.length === 0 && (
                                                                                    <span className="text-[10px] text-gray-400 italic">ไม่ระบุข้อมูลห้องเรียน</span>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 2 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
                                        <div className="text-xs text-indigo-500 mb-1">คะแนนเก็บ</div>
                                        <div className="text-2xl font-bold text-indigo-600">{formData.formativeWeight || 0}</div>
                                    </div>
                                    <div className="p-4 bg-indigo-50 dark:bg-indigo-900/10 rounded-xl border border-indigo-100 dark:border-indigo-800 text-center">
                                        <div className="text-xs text-indigo-500 mb-1">กลางภาค</div>
                                        <div className="text-2xl font-bold text-indigo-600">{formData.midtermWeight || 0}</div>
                                    </div>
                                    <div className="p-4 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl border border-indigo-200 dark:border-indigo-700 text-center">
                                        <div className="text-xs text-indigo-500 mb-1">ปลายภาค</div>
                                        <div className="text-2xl font-bold text-indigo-600">{100 - (formData.formativeWeight || 0) - (formData.midtermWeight || 0)}</div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">
                                        {formData.type === 'พื้นฐาน' ? 'ตัวชี้วัด (Indicators)' : 'ผลการเรียนรู้ (Expected Outcomes)'}
                                    </label>
                                    <div className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 border border-gray-100 dark:border-gray-800 whitespace-pre-wrap text-sm leading-relaxed text-gray-700 dark:text-gray-300 max-h-60 overflow-y-auto">
                                        {(formData.type === 'พื้นฐาน' ? formData.indicators : formData.expectedOutcomes)?.join('\n') || "-"}
                                    </div>
                                </div>
                            </div>
                        )}

                        {currentStep === 3 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="grid grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">หน่วยกิต</label>
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800 font-bold">
                                            {formData.credits || 1.0}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-500 mb-1">จำนวนคาบ/สัปดาห์</label>
                                        <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-xl text-gray-900 dark:text-white border border-gray-100 dark:border-gray-800 font-bold">
                                            {formData.hoursPerWeek || 2}
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">ระดับชั้นและห้องเรียนรวม</label>
                                    <div className="flex flex-wrap gap-2">
                                        {(Array.isArray(formData.classId) ? formData.classId : [formData.classId]).filter(Boolean).map(c => (
                                            <span key={c as string} className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 rounded-lg text-xs font-bold">
                                                {availableClassOptions.find(opt => opt[0] === c)?.[1] || c}
                                            </span>
                                        ))}
                                        {formData.room?.map(r => (
                                            <span key={r} className="px-3 py-1.5 bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-lg text-xs font-bold">
                                                ห้อง {r}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                {formData.isCombined && (
                                    <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl flex items-center gap-3">
                                        <div className="w-10 h-10 flex items-center justify-center bg-amber-500 text-white rounded-full">
                                            <LayoutGrid size={20} />
                                        </div>
                                        <div>
                                            <div className="text-sm font-bold text-amber-800 dark:text-amber-400">โหมดสอนรวมห้อง</div>
                                            <div className="text-xs text-amber-600/80">วิชานี้อนุญาตให้ระบุชั้นและห้องเรียนหลายรายการต่อคน</div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {currentStep === 4 && (
                            <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">วันที่ไม่สะดวกสอน</label>
                                    <div className="flex gap-2">
                                        {Object.entries(DAYS_OF_WEEK).map(([key, label]) => (
                                            <div key={key} className={`flex-1 p-3 rounded-xl border text-center text-sm font-bold transition-all ${formData.constraints?.disallowedDays?.includes(key) ? 'bg-red-500 border-red-500 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-400 opacity-50'}`}>
                                                {label}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-500 mb-2">คาบเรียนที่ล็อกไว้ (Locked Slots)</label>
                                    {formData.constraints?.lockedSlots?.length ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {formData.constraints.lockedSlots.map((slot, i) => (
                                                <div key={i} className="p-2 border border-indigo-100 dark:border-indigo-800 rounded-lg text-xs flex justify-between items-center bg-indigo-50/50 dark:bg-indigo-500/5">
                                                    <span className="font-bold text-indigo-600">{DAYS_OF_WEEK[slot.day]}</span>
                                                    <span className="bg-indigo-600 text-white px-1.5 rounded">คาบ {slot.periodId}</span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-6 bg-gray-50 dark:bg-gray-800/30 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-gray-400 text-sm italic">
                                            ไม่มีคาบเรียนที่ล็อกไว้
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex justify-between bg-gray-50/50 dark:bg-white/5 rounded-b-2xl">
                    <button
                        onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                        disabled={currentStep === 1}
                        className="px-6 py-2 rounded-xl text-sm font-bold text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 transition-all disabled:opacity-0"
                    >
                        ย้อนกลับ
                    </button>
                    <div className="flex gap-3">
                        {currentStep < 4 ? (
                            <button
                                onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
                                className="px-8 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/20 transition-all flex items-center gap-2"
                            >
                                ขั้นตอนถัดไป <ChevronRight size={16} />
                            </button>
                        ) : (
                            <button
                                onClick={onClose}
                                className="px-8 py-2 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                            >
                                ปิดหน้าต่าง
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
