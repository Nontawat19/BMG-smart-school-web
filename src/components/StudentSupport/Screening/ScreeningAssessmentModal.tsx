import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle, CheckCircle, Brain, Heart, Home, AlertTriangle } from 'lucide-react';
import Swal from 'sweetalert2';
import { ScreeningAssessment, saveScreeningAssessment } from '@/services/screeningService';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    student: any;
    evaluatorType: 'teacher' | 'student' | 'parent';
    initialData?: ScreeningAssessment | null;
    onSave: () => void;
    schoolId: string;
}

const ScreeningAssessmentModal: React.FC<Props> = ({
    isOpen, onClose, student, evaluatorType, initialData, onSave, schoolId
}) => {
    const [activeTab, setActiveTab] = useState<'academic' | 'health' | 'family' | 'other'>('academic');
    const [formData, setFormData] = useState<any>({
        academic: { readWrite: 'good', talents: '', other: '', status: 'normal' },
        health: { weight: 0, height: 0, bmi: 0, congenitalDisease: '', disabilities: '', mentalHealth: '', status: 'normal' },
        family: { parentsStatus: 'together', economy: 'sufficient', security: 'safe', relationship: 'good', status: 'normal' },
        other: { behavior: '', sexual: '', drugs: '', games: '', status: 'normal' }
    });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen && initialData) {
            setFormData(initialData);
        } else if (isOpen) {
            // Reset logic
            setFormData({
                academic: { readWrite: 'good', talents: '', other: '', status: 'normal' },
                health: { weight: 0, height: 0, bmi: 0, congenitalDisease: '', disabilities: '', mentalHealth: '', status: 'normal' },
                family: { parentsStatus: 'together', economy: 'sufficient', security: 'safe', relationship: 'good', status: 'normal' },
                other: { behavior: '', sexual: '', drugs: '', games: '', status: 'normal' }
            });
        }
    }, [isOpen, initialData]);

    const handleChange = (section: string, field: string, value: any) => {
        setFormData((prev: any) => {
            const newData = { ...prev };
            newData[section] = { ...newData[section], [field]: value };

            // Auto-calculate BMI
            if (section === 'health' && (field === 'weight' || field === 'height')) {
                const w = field === 'weight' ? parseFloat(value) : prev.health.weight;
                const h = field === 'height' ? parseFloat(value) : prev.health.height;
                if (w > 0 && h > 0) {
                    const heightM = h / 100;
                    newData.health.bmi = parseFloat((w / (heightM * heightM)).toFixed(2));
                }
            }

            // Auto-update status logic (Simplified example)
            // Academic Risk: readWrite poor
            if (section === 'academic') {
                if (newData.academic.readWrite === 'poor') newData.academic.status = 'problem';
                else if (newData.academic.readWrite === 'fair') newData.academic.status = 'risk';
                else newData.academic.status = 'normal';
            }
            // Health Risk: BMI > 25 or < 16, or illness
            if (section === 'health') {
                if (newData.health.bmi > 30 || newData.health.bmi < 15 || newData.health.congenitalDisease || newData.health.mentalHealth === 'problem')
                    newData.health.status = 'problem';
                else if (newData.health.bmi > 25 || newData.health.bmi < 17)
                    newData.health.status = 'risk';
                else newData.health.status = 'normal';
            }
            // Family Risk: Parents separated/divorced -> Risk?
            if (section === 'family') {
                if (newData.family.parentsStatus === 'deceased' || newData.family.economy === 'poor')
                    newData.family.status = 'risk'; // Standard logic might be risk
                else newData.family.status = 'normal';
            }

            return newData;
        });
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Determine summary status (Worst of all sections)
            let summary = 'normal';
            const statuses = [formData.academic.status, formData.health.status, formData.family.status, formData.other.status];
            if (statuses.includes('problem')) summary = 'problem';
            else if (statuses.includes('risk')) summary = 'risk';

            await saveScreeningAssessment(schoolId, {
                studentId: student.id,
                evaluatorType,
                academicYear: '2567', // Should be dynamic
                term: '1',
                ...formData,
                summary
            } as any);

            Swal.fire('Saved', 'บันทึกข้อมูลคัดกรองเรียบร้อยแล้ว', 'success');
            onSave();
            onClose();
        } catch (error) {
            console.error(error);
            Swal.fire('Error', 'Failed to save screening', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !student) return null;

    const TabButton = ({ id, label, icon: Icon }: any) => (
        <button
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 font-medium transition-colors ${activeTab === id
<<<<<<< HEAD
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white'
=======
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                }`}
        >
            <Icon size={18} />
            {label}
        </button>
    );

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-4xl h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white">แบบคัดกรองนักเรียนรายบุคคล</h2>
<<<<<<< HEAD
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            {student.title}{student.firstName} {student.lastName} (ผู้ประเมิน: {evaluatorType === 'teacher' ? 'ครู' : evaluatorType === 'student' ? 'นักเรียน' : 'ผู้ปกครอง'})
                        </p>
                    </div>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" /></button>
=======
                        <p className="text-sm text-gray-500">
                            {student.title}{student.firstName} {student.lastName} (ผู้ประเมิน: {evaluatorType === 'teacher' ? 'ครู' : evaluatorType === 'student' ? 'นักเรียน' : 'ผู้ปกครอง'})
                        </p>
                    </div>
                    <button onClick={onClose}><X className="text-gray-400 hover:text-gray-600" /></button>
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 dark:border-gray-700 px-6">
                    <TabButton id="academic" label="1. ด้านการเรียน" icon={Brain} />
                    <TabButton id="health" label="2. ด้านสุขภาพ" icon={Heart} />
                    <TabButton id="family" label="3. ด้านครอบครัว" icon={Home} />
                    <TabButton id="other" label="4. อื่นๆ" icon={AlertTriangle} />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50 dark:bg-gray-900/50">
                    {/* ACADEMIC TAB */}
                    {activeTab === 'academic' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                                <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">ผลการเรียนและความสามารถ</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ทักษะการอ่าน/เขียน</label>
                                        <select
                                            value={formData.academic.readWrite}
                                            onChange={(e) => handleChange('academic', 'readWrite', e.target.value)}
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                                        >
                                            <option value="good">ปกติ (อ่านออกเขียนได้ดี)</option>
                                            <option value="fair">พอใช้ (อ่านไม่คล่อง/เขียนผิดบ้าง)</option>
                                            <option value="poor">ปรับปรุง (อ่านไม่ออก/เขียนไม่ได้)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ความสามารถพิเศษ</label>
                                        <input
                                            type="text"
                                            value={formData.academic.talents}
                                            onChange={(e) => handleChange('academic', 'talents', e.target.value)}
                                            placeholder="ระบุความสามารถพิเศษ (ดนตรี, กีฬา, ศิลปะ...)"
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ปัญหาอื่นๆ ด้านการเรียน</label>
                                        <textarea
                                            value={formData.academic.other}
                                            onChange={(e) => handleChange('academic', 'other', e.target.value)}
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600"
                                            rows={3}
                                            placeholder="เช่น หนีเรียน, มาสายบ่อย, ไม่ส่งงาน..."
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* HEALTH TAB */}
                    {activeTab === 'health' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                                <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">สุขภาพกายและจิต</h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">น้ำหนัก (กก.)</label>
<<<<<<< HEAD
                                        <input 
                                            type="number" 
                                            value={formData.health.weight} 
                                            onChange={(e) => handleChange('health', 'weight', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ส่วนสูง (ซม.)</label>
                                        <input 
                                            type="number" 
                                            value={formData.health.height} 
                                            onChange={(e) => handleChange('health', 'height', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">BMI (คำนวณอัตโนมัติ)</label>
                                        <div className="w-full p-2 bg-gray-100 dark:bg-gray-700/50 dark:text-indigo-400 rounded-lg font-bold text-center">{formData.health.bmi || '-'}</div>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">โรคประจำตัว / ความพิการ</label>
                                        <input 
                                            type="text" 
                                            value={formData.health.congenitalDisease} 
                                            onChange={(e) => handleChange('health', 'congenitalDisease', e.target.value)} 
                                            placeholder="ระบุโรคประจำตัว (ถ้ามี)" 
                                            className="w-full p-2 border rounded-lg mb-2 bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                        />
                                        <input 
                                            type="text" 
                                            value={formData.health.disabilities} 
                                            onChange={(e) => handleChange('health', 'disabilities', e.target.value)} 
                                            placeholder="ระบุความพิการ (ถ้ามี)" 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                        />
=======
                                        <input type="number" value={formData.health.weight} onChange={(e) => handleChange('health', 'weight', e.target.value)} className="w-full p-2 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ส่วนสูง (ซม.)</label>
                                        <input type="number" value={formData.health.height} onChange={(e) => handleChange('health', 'height', e.target.value)} className="w-full p-2 border rounded-lg" />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">BMI (คำนวณอัตโนมัติ)</label>
                                        <div className="w-full p-2 bg-gray-100 rounded-lg font-bold text-center">{formData.health.bmi || '-'}</div>
                                    </div>
                                    <div className="md:col-span-3">
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">โรคประจำตัว / ความพิการ</label>
                                        <input type="text" value={formData.health.congenitalDisease} onChange={(e) => handleChange('health', 'congenitalDisease', e.target.value)} placeholder="ระบุโรคประจำตัว (ถ้ามี)" className="w-full p-2 border rounded-lg mb-2" />
                                        <input type="text" value={formData.health.disabilities} onChange={(e) => handleChange('health', 'disabilities', e.target.value)} placeholder="ระบุความพิการ (ถ้ามี)" className="w-full p-2 border rounded-lg" />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* FAMILY TAB */}
                    {activeTab === 'family' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                                <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">ข้อมูลครอบครัว</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">สถานภาพบิดา-มารดา</label>
<<<<<<< HEAD
                                        <select 
                                            value={formData.family.parentsStatus} 
                                            onChange={(e) => handleChange('family', 'parentsStatus', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        >
=======
                                        <select value={formData.family.parentsStatus} onChange={(e) => handleChange('family', 'parentsStatus', e.target.value)} className="w-full p-2 border rounded-lg">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                            <option value="together">อยู่ด้วยกัน</option>
                                            <option value="separated">แยกกันอยู่</option>
                                            <option value="divorced">หย่าร้าง</option>
                                            <option value="deceased">บิดา/มารดา เสียชีวิต</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">เศรษฐกิจครอบครัว</label>
<<<<<<< HEAD
                                        <select 
                                            value={formData.family.economy} 
                                            onChange={(e) => handleChange('family', 'economy', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        >
=======
                                        <select value={formData.family.economy} onChange={(e) => handleChange('family', 'economy', e.target.value)} className="w-full p-2 border rounded-lg">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                            <option value="sufficient">เพียงพอ</option>
                                            <option value="poor">ยากจน / รายได้น้อย</option>
                                            <option value="debt">มีภาระหนี้สินมาก</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ความปลอดภัย/ที่พักอาศัย</label>
<<<<<<< HEAD
                                        <select 
                                            value={formData.family.security} 
                                            onChange={(e) => handleChange('family', 'security', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                                        >
=======
                                        <select value={formData.family.security} onChange={(e) => handleChange('family', 'security', e.target.value)} className="w-full p-2 border rounded-lg">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                            <option value="safe">ปลอดภัยดี</option>
                                            <option value="risk">อยู่ในแหล่งมั่วสุม/ไม่ปลอดภัย</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* OTHER TAB */}
                    {activeTab === 'other' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm">
                                <h3 className="font-bold text-lg mb-4 text-gray-900 dark:text-white">พฤติกรรมและความเสี่ยงอื่นๆ</h3>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">พฤติกรรมเสี่ยง / ก้าวร้าว</label>
<<<<<<< HEAD
                                        <input 
                                            type="text" 
                                            value={formData.other.behavior} 
                                            onChange={(e) => handleChange('other', 'behavior', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                            placeholder="ระบุ..." 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ความเสี่ยงสารเสพติด</label>
                                        <input 
                                            type="text" 
                                            value={formData.other.drugs} 
                                            onChange={(e) => handleChange('other', 'drugs', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                            placeholder="บุหรี่, แอลกอฮอล์, ยาเสพติด..." 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ติดเกม / สื่อโซเชียล</label>
                                        <input 
                                            type="text" 
                                            value={formData.other.games} 
                                            onChange={(e) => handleChange('other', 'games', e.target.value)} 
                                            className="w-full p-2 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-white" 
                                            placeholder="รายละเอียด..." 
                                        />
=======
                                        <input type="text" value={formData.other.behavior} onChange={(e) => handleChange('other', 'behavior', e.target.value)} className="w-full p-2 border rounded-lg" placeholder="ระบุ..." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ความเสี่ยงสารเสพติด</label>
                                        <input type="text" value={formData.other.drugs} onChange={(e) => handleChange('other', 'drugs', e.target.value)} className="w-full p-2 border rounded-lg" placeholder="บุหรี่, แอลกอฮอล์, ยาเสพติด..." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">ติดเกม / สื่อโซเชียล</label>
                                        <input type="text" value={formData.other.games} onChange={(e) => handleChange('other', 'games', e.target.value)} className="w-full p-2 border rounded-lg" placeholder="รายละเอียด..." />
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-b-2xl flex justify-between items-center">
<<<<<<< HEAD
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                        <span>สถานะประเมิน:</span>
                        <span className={`px-2 py-1 rounded font-bold uppercase
                           ${formData.academic.status === 'problem' || formData.health.status === 'problem' || formData.family.status === 'problem' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                                formData.academic.status === 'risk' || formData.health.status === 'risk' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}
=======
                    <div className="flex items-center gap-2 text-sm">
                        <span>สถานะประเมิน:</span>
                        <span className={`px-2 py-1 rounded font-bold uppercase
                           ${formData.academic.status === 'problem' || formData.health.status === 'problem' || formData.family.status === 'problem' ? 'bg-red-100 text-red-700' :
                                formData.academic.status === 'risk' || formData.health.status === 'risk' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                       `}>
                            {formData.academic.status === 'problem' || formData.health.status === 'problem' ? 'มีปัญหา' : formData.academic.status === 'risk' ? 'กลุ่มเสี่ยง' : 'ปกติ'}
                        </span>
                    </div>
                    <div className="flex gap-3">
<<<<<<< HEAD
                        <button onClick={onClose} className="px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600 transition-colors">ยกเลิก</button>
                        <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2 transition-colors disabled:opacity-50">
=======
                        <button onClick={onClose} className="px-5 py-2 rounded-lg bg-gray-100 hover:bg-gray-200">ยกเลิก</button>
                        <button onClick={handleSave} disabled={isSaving} className="px-6 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-2">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                            <Save size={18} /> บันทึก
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreeningAssessmentModal;
