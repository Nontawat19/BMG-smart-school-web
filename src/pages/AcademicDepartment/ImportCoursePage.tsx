import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import { firestore } from '@/firebase';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import {
    FaFileUpload, FaFileExcel, FaCheckCircle,
    FaExclamationTriangle, FaTable, FaSave,
    FaTimes, FaCloudUploadAlt, FaChevronRight,
    FaDownload, FaEdit, FaCalendarAlt, FaList
} from 'react-icons/fa';
import BackButton from '@/components/Shared/BackButton';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';

// --- Configuration ---
// ตามโครงสร้างจริงของ Excel: A=ชั้น, B=ห้อง/หมู่, C=รหัสวิชา, D=ชื่อวิชา, E=Code(English), F=Titles(English), G=หน่วยกิต, H=ประเภทวิชา, I=กลุ่มสาระ, J=จำนวนคาบ/สัปดาห์, K=คะแนนเก็บ, L=คะแนนกลางภาค, M=ภาคเรียน
// ฟิลด์บังคับ: ชั้น, ชื่อวิชา, ประเภทวิชา, กลุ่มสาระ
const REQUIRED_FIELDS = [
    { key: 'classId', label: 'ชั้น', required: true },
    { key: 'room', label: 'ห้อง/หมู่', required: false },
    { key: 'code', label: 'รหัสวิชา', required: false },
    { key: 'title', label: 'ชื่อวิชา', required: true },
    { key: 'codeEn', label: 'Code (English)', required: false },
    { key: 'titleEn', label: 'Titles (English)', required: false },
    { key: 'credits', label: 'หน่วยกิต', required: false },
    { key: 'type', label: 'ประเภทวิชา', required: true },
    { key: 'subjectGroup', label: 'กลุ่มสาระ', required: true },
    { key: 'hoursPerWeek', label: 'จำนวนคาบ/สัปดาห์', required: false },
    { key: 'formativeWeight', label: 'คะแนนเก็บ (%)', required: false },
    { key: 'midtermWeight', label: 'คะแนนกลางภาค (%)', required: false },
    { key: 'semester', label: 'ภาคเรียน', required: true }, // Semester is now required from Excel
];

const CLASSES: Record<string, string> = {
    k1: 'อ.1', k2: 'อ.2', k3: 'อ.3',
    p1: 'ป.1', p2: 'ป.2', p3: 'ป.3',
    p4: 'ป.4', p5: 'ป.5', p6: 'ป.6',
    m1: 'ม.1', m2: 'ม.2', m3: 'ม.3',
    m4: 'ม.4', m5: 'ม.5', m6: 'ม.6',
};

const FULL_CLASSES: Record<string, string> = {
    k1: 'อนุบาลปีที่ 1', k2: 'อนุบาลปีที่ 2', k3: 'อนุบาลปีที่ 3',
    p1: 'ประถมศึกษาปีที่ 1', p2: 'ประถมศึกษาปีที่ 2', p3: 'ประถมศึกษาปีที่ 3',
    p4: 'ประถมศึกษาปีที่ 4', p5: 'ประถมศึกษาปีที่ 5', p6: 'ประถมศึกษาปีที่ 6',
    m1: 'มัธยมศึกษาปีที่ 1', m2: 'มัธยมศึกษาปีที่ 2', m3: 'มัธยมศึกษาปีที่ 3',
    m4: 'มัธยมศึกษาปีที่ 4', m5: 'มัธยมศึกษาปีที่ 5', m6: 'มัธยมศึกษาปีที่ 6',
};

/**
 * แปลงชื่อชั้นเรียนจาก Excel ให้เป็น Key มาตรฐาน (e.g., "ม.2" -> "m2")
 */
const standardizeClassId = (val: string): string => {
    if (!val) return val;
    val = val.trim();

    // 1. ลองหาตรงๆ ใน CLASSES (Label lookup)
    for (const [key, label] of Object.entries(CLASSES)) {
        if (val === label) return key;
    }

    // 2. ลองหาใน FULL_CLASSES
    for (const [key, label] of Object.entries(FULL_CLASSES)) {
        if (val === label) return key;
    }

    // 3. จัดการกรณีอื่นๆ เช่น "มศึกษาปีที่ 1" หรือ "ม. 1" (มีเว้นวรรค)
    const normalized = val.replace(/\s+/g, '');
    for (const [key, label] of Object.entries(CLASSES)) {
        if (normalized === label.replace(/\s+/g, '')) return key;
    }

    return val; // ถ้าไม่พบให้ใช้ค่าเดิม
};

interface MappedCourse {
    classId: string;
    subjectGroup: string;
    code?: string;
    title: string;
    codeEn?: string;
    titleEn?: string;
    credits?: string;
    type: string;
    room?: string;
    hoursPerWeek: number;
    formativeWeight: number;
    midtermWeight: number;
    semester?: string; // Added semester field
    status: 'pending' | 'warning' | 'ready' | 'error';
    errorMessage?: string;
}

const ImportCoursePage: React.FC = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;

    // --- State ---
    const [file, setFile] = useState<File | null>(null);
    const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [previewData, setPreviewData] = useState<MappedCourse[]>([]);
    const [subjectGroupMap, setSubjectGroupMap] = useState<Record<string, string>>({});

    // Status Flags
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'complete' | 'missing_fields' | 'analyzing'>('idle');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    // Manual Mapping States
    const [manualMappingMode, setManualMappingMode] = useState(false);
    const [tempColumnMapping, setTempColumnMapping] = useState<Record<string, string>>({});

    // Filter States
    const [selectedSubjectGroup, setSelectedSubjectGroup] = useState<string>('all');
    const [selectedType, setSelectedType] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 20;

    // Filtered data calculation
    const filteredData = previewData.filter(course => {
        if (selectedSubjectGroup !== 'all' && course.subjectGroup !== selectedSubjectGroup) return false;
        if (selectedType !== 'all' && course.type !== selectedType) return false;
        return true;
    });

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    // Get unique values for filters
    const subjectGroups = Array.from(new Set(previewData.map(c => c.subjectGroup))).filter(Boolean);
    const courseTypes = Array.from(new Set(previewData.map(c => c.type))).filter(Boolean);

    // Fetch Subject Group Mapping
    useEffect(() => {
        if (!schoolId) return;
        const fetchMapping = async () => {
            try {
                const colRef = collection(firestore, 'school-settings', schoolId, 'subject_groups');
                const snapshot = await getDocs(colRef);
                const mapping: Record<string, string> = {};
                snapshot.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.code) {
                        mapping[String(data.code)] = data.name;
                    }
                    // Mapping by ID as well just in case
                    mapping[doc.id] = data.name;
                });
                setSubjectGroupMap(mapping);
            } catch (error) {
                console.error("Error fetching subject group mapping:", error);
            }
        };
        fetchMapping();
    }, [schoolId]);

    // --- File Handling ---
    const handleDownloadTemplate = (extension: 'xlsx' | 'xls') => {
        const headers = REQUIRED_FIELDS.map(f => f.label + (f.required ? ' *' : ''));

        // ข้อมูลตัวอย่าง
        const exampleData = [
            ['ม.1', '1', 'ว21101', 'วิทยาศาสตร์ 1', 'SCI21101', 'Science 1', '1.5', 'พื้นฐาน', 'วิทยาศาสตร์และเทคโนโลยี', '3', '70', '30', '1'],
            ['ม.4', '1', 'ค31101', 'คณิตศาสตร์ 1', 'MAT31101', 'Mathematics 1', '1.0', 'พื้นฐาน', 'คณิตศาสตร์', '2', '80', '20', '1'],
        ];

        const worksheetData = [headers, ...exampleData];
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        // กำหนดความกว้างคอลัมน์ให้อ่านง่าย
        const wscols = headers.map(() => ({ wch: 15 }));
        wscols[3] = { wch: 30 }; // ชื่อวิชา
        wscols[5] = { wch: 30 }; // Titles (English)
        wscols[8] = { wch: 25 }; // กลุ่มสาระ
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Template");

        XLSX.writeFile(wb, `Course_Import_Template.${extension}`);
    };
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            handleFileProcess(selectedFile);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const selectedFile = e.dataTransfer.files?.[0];
        if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls'))) {
            handleFileProcess(selectedFile);
        } else {
            Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาอัปโหลดไฟล์ (.xlsx, .xls) เท่านั้น', 'warning');
        }
    };

    const handleFileProcess = (file: File) => {
        setFile(file);
        setIsAnalyzing(true);
        setAnalysisStatus('analyzing');
        setPreviewData([]);

        const reader = new FileReader();
        reader.onload = (e) => {
            const wb = XLSX.read(e.target?.result, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length > 0) {
                // Smart Header Detection
                let bestHeaderRowIndex = 0;
                let maxMatches = 0;

                for (let i = 0; i < Math.min(data.length, 20); i++) {
                    const row = data[i];
                    if (!Array.isArray(row)) continue;

                    let matches = 0;
                    const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');

                    if (rowStr.includes('ชั้น')) matches++;
                    if (rowStr.includes('กลุ่มสาระ')) matches++;
                    if (rowStr.includes('รหัสวิชา')) matches++;
                    if (rowStr.includes('ชื่อวิชา')) matches++;
                    if (rowStr.includes('ประเภท')) matches++;

                    if (matches > maxMatches) {
                        maxMatches = matches;
                        bestHeaderRowIndex = i;
                    }
                }

                const headerRowIndex = maxMatches >= 2 ? bestHeaderRowIndex : 0;
                const rawHeaders = data[headerRowIndex] as any[];
                const headers = rawHeaders.map(h => String(h || '').trim()).filter(h => h !== '');

                setExcelHeaders(headers);
                setExcelData(data.slice(headerRowIndex + 1));

                // Smart Auto-Map
                const newMapping: Record<string, string> = {};
                let missingCount = 0;

                REQUIRED_FIELDS.forEach(field => {
                    const match = headers.find(h => {
                        const hLower = h.toLowerCase().trim();

                        // Exact matches & Variations - รองรับการพิมพ์ตกหรือพิมพ์ผิด (เช่น ขื่อวิชา, ภาคเรียนที่)
                        if (field.key === 'classId' && (h === 'ชั้น' || h === 'ระดับชั้น' || h === 'ระดับ' || hLower.includes('grade') || hLower.includes('class'))) return true;
                        if (field.key === 'room' && (h === 'ห้อง/หมู่' || h === 'กลุ่มเรียน' || h === 'ห้อง' || h === 'หมู่' || hLower.includes('room') || hLower.includes('section'))) return true;
                        if (field.key === 'code' && (h === 'รหัสวิชา' || h === 'รหัส' || hLower.includes('code'))) return true;
                        if (field.key === 'title' && (h === 'ชื่อวิชา' || h === 'ขื่อวิชา' || h === 'วิชา' || hLower.includes('title') || hLower.includes('name'))) return true;
                        if (field.key === 'codeEn' && (h === 'Code (English)' || hLower.includes('code en'))) return true;
                        if (field.key === 'titleEn' && (h === 'Titles (English)' || hLower.includes('title en'))) return true;
                        if (field.key === 'credits' && (h === 'หน่วยกิต' || hLower.includes('credit'))) return true;
                        if (field.key === 'type' && (h === 'ประเภทวิชา' || h === 'ประเภท' || hLower.includes('type'))) return true;
                        if (field.key === 'subjectGroup' && (h === 'กลุ่มสาระ' || h === 'กลุ่มสาระฯ' || h === 'กลุ่มสาระการเรียนรู้' || hLower.includes('group') || hLower.includes('dept'))) return true;
                        if (field.key === 'hoursPerWeek' && (h === 'จำนวนคาบ/สัปดาห์' || h === 'คาบ/สัปดาห์' || h === 'คาบ' || hLower.includes('hour') || hLower.includes('period'))) return true;
                        if (field.key === 'formativeWeight' && (h === 'คะแนนเก็บ (%)' || h === 'คะแนนเก็บ' || hLower.includes('formative'))) return true;
                        if (field.key === 'midtermWeight' && (h === 'คะแนนกลางภาค (%)' || h === 'กลางภาค' || hLower.includes('midterm'))) return true;
                        if (field.key === 'semester' && (h === 'ภาคเรียน' || h === 'ภาคเรียนที่' || h === 'เทอม' || hLower.includes('semester') || hLower.includes('term'))) return true; 

                        return false;
                    });

                    if (match) {
                        newMapping[field.key] = match;
                    } else if (field.required) {
                        missingCount++;
                    }
                });

                setColumnMapping(newMapping);
                setIsAnalyzing(false);

                if (missingCount > 0) {
                    setAnalysisStatus('missing_fields');
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'warning',
                        title: 'บางคอลัมน์ไม่ตรงกัน กรุณาตรวจสอบ',
                        showConfirmButton: false,
                        timer: 3000
                    });
                } else {
                    setAnalysisStatus('complete');
                    generatePreview(newMapping, data.slice(headerRowIndex + 1), headers);
                    Swal.fire({
                        toast: true,
                        position: 'top-end',
                        icon: 'success',
                        title: 'ข้อมูลพร้อมนำเข้า',
                        showConfirmButton: false,
                        timer: 3000
                    });
                }
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- Generate Preview ---
    const generatePreview = (mapping: Record<string, string>, rawData: any[], headers: string[]) => {
        try {
            const mapped: MappedCourse[] = rawData.map((row: any) => {
                const rowData: any = {};
                Object.entries(mapping).forEach(([key, header]) => {
                    const colIndex = headers.indexOf(header);
                    if (colIndex !== -1 && row[colIndex] !== undefined) {
                        let val = String(row[colIndex]).trim();
                        // Special Handling for Subject Group Mapping (Automatic Translation)
                        if (key === 'subjectGroup' && val) {
                            if (subjectGroupMap[val]) {
                                val = subjectGroupMap[val];
                            }
                        }

                        // Special Handling for Class ID Standardization
                        if (key === 'classId' && val) {
                            val = standardizeClassId(val);
                        }
                        rowData[key] = val;
                    } else {
                        rowData[key] = "";
                    }
                });

                // Validation
                let status: 'ready' | 'warning' | 'error' = 'ready';
                let errorMessage = '';

                // Check required fields (เฉพาะฟิลด์หลัก)
                if (!rowData.title) {
                    status = 'error'; // ชื่อวิชายังจำเป็นต้องมี
                    errorMessage = 'ไม่มีชื่อวิชา';
                } else if (!rowData.classId || !rowData.subjectGroup || !rowData.type) {
                    // อนุญาตให้ผ่านได้แต่แจ้งเตือน (Relaxed Validation)
                    status = 'warning';
                    errorMessage = 'ข้อมูลบางส่วนไม่ครบ (ชั้น, หรือกลุ่มสาระ)';
                }

                // Skip teacher warning as requested

                // Check score weights
                const formative = Number(rowData.formativeWeight) || 0;
                const midterm = Number(rowData.midtermWeight) || 0;
                const final = 100 - formative - midterm;

                if (formative + midterm + final !== 100) {
                    status = 'warning'; // Relax to warning
                    errorMessage = 'สัดส่วนคะแนนไม่รวมเป็น 100%';
                }

                return {
                    classId: rowData.classId || "ไม่ระบุ", // Default if missing
                    subjectGroup: rowData.subjectGroup || "ไม่ระบุ", // Default if missing
                    code: rowData.code || "",
                    title: rowData.title || "",
                    codeEn: rowData.codeEn || "",
                    titleEn: rowData.titleEn || "",
                    credits: rowData.credits || "",
                    type: rowData.type || "ไม่ระบุ", // Default if missing
                    room: rowData.room || "",
                    hoursPerWeek: rowData.credits ? Math.round(Number(rowData.credits) * 2) : (Number(rowData.hoursPerWeek) || 1),
                    formativeWeight: formative,
                    midtermWeight: midterm,
                    semester: rowData.semester ? String(rowData.semester) : undefined, // Read semester from row
                    status,
                    errorMessage
                };
            }).filter(item => item.title);

            setPreviewData(mapped);
        } catch (e) {
            console.error("Preview Generation Error", e);
        }
    };

    // Watch for mapping changes
    useEffect(() => {
        if (excelData.length > 0 && excelHeaders.length > 0) {
            const missingRequired = REQUIRED_FIELDS.filter(f => f.required && !columnMapping[f.key]);
            if (missingRequired.length === 0) {
                setAnalysisStatus('complete');
                generatePreview(columnMapping, excelData, excelHeaders);
            } else {
                setAnalysisStatus('missing_fields');
            }
        }
    }, [columnMapping]);

    // --- Manual Mapping Functions ---
    const handleManualMapping = (excelColumn: string, systemField: string) => {
        setTempColumnMapping(prev => {
            const newMapping = { ...prev };

            // ลบ mapping เก่าที่ชี้ไปที่ systemField เดียวกัน
            Object.keys(newMapping).forEach(key => {
                if (newMapping[key] === excelColumn) {
                    delete newMapping[key];
                }
            });

            // ถ้าเลือก "ไม่ใช้" ให้ลบ mapping
            if (systemField === '') {
                return newMapping;
            }

            // เพิ่ม mapping ใหม่
            newMapping[systemField] = excelColumn;
            return newMapping;
        });
    };

    const confirmMapping = () => {
        // ตรวจสอบว่าฟิลด์บังคับครบหรือไม่
        const requiredFields = REQUIRED_FIELDS.filter(f => f.required);
        const missingFields = requiredFields.filter(f => !tempColumnMapping[f.key]);

        if (missingFields.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ฟิลด์บังคับยังไม่ครบ',
                html: `กรุณาเลือกฟิลด์ต่อไปนี้:<br/><strong>${missingFields.map(f => f.label).join(', ')}</strong>`,
                confirmButtonText: 'ตกลง'
            });
            return;
        }

        // ตรวจสอบการแม็ปซ้ำ
        const mappedColumns = Object.values(tempColumnMapping);
        const duplicates = mappedColumns.filter((item, index) => mappedColumns.indexOf(item) !== index);

        if (duplicates.length > 0) {
            Swal.fire({
                icon: 'warning',
                title: 'พบการแม็ปซ้ำ',
                text: 'กรุณาตรวจสอบการแม็ปอีกครั้ง',
                confirmButtonText: 'ตกลง'
            });
            return;
        }

        setColumnMapping(tempColumnMapping);
        setManualMappingMode(false);
        setAnalysisStatus('complete');

        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: 'บันทึกการจับคู่เรียบร้อย',
            showConfirmButton: false,
            timer: 2000
        });
    };

    const resetMapping = () => {
        setTempColumnMapping({});
    };

    const openManualMapping = () => {
        setTempColumnMapping(columnMapping);
        setManualMappingMode(true);
    };

    // --- Save to Firebase ---
    const handleSave = async () => {
        if (!schoolId) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่พบข้อมูลโรงเรียน',
                text: 'ไม่สามารถบันทึกข้อมูลได้',
            });
            return;
        }

        // รวมข้อมูลที่พร้อมและมี warning (ไม่มีครูผู้สอน)
        const readyData = previewData.filter(c => c.status === 'ready' || c.status === 'warning');
        if (readyData.length === 0) {
            Swal.fire({
                icon: 'warning',
                title: 'ไม่มีข้อมูลที่พร้อมนำเข้า',
                text: 'กรุณาตรวจสอบข้อมูลและแก้ไขข้อผิดพลาด',
            });
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        let successCount = 0;
        let failCount = 0;

        const coursesRef = collection(firestore, 'school-settings', schoolId, 'courses');
        const total = readyData.length;

        Swal.fire({
            title: 'กำลังนำเข้าข้อมูล...',
            html: `<div class="text-center">
                <p class="mb-4">กำลังประมวลผล <span id="current">0</span>/${total} รายการ</p>
                <div class="w-full bg-gray-200 rounded-full h-2.5">
                    <div id="progress-bar" class="bg-indigo-600 h-2.5 rounded-full" style="width: 0%"></div>
                </div>
            </div>`,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => {
                Swal.showLoading();
            },
        });

        for (let i = 0; i < readyData.length; i++) {
            const course = readyData[i];
            try {
                const courseData = {
                    title: course.title,
                    code: course.code || '',
                    subjectGroup: course.subjectGroup,
                    type: course.type,
                    formativeWeight: course.formativeWeight,
                    midtermWeight: course.midtermWeight,
                    classId: [course.classId],
                    hoursPerWeek: course.hoursPerWeek,
                    credits: String(course.credits || ''),
                    room: course.room ? [course.room] : ['all'],
                    teacherId: 'pending', // ครูผู้สอนตั้งเป็น pending รอการมอบหมายภายหลัง
                    teacherIds: ['pending'], // Added teacherIds array for alignment
                    isCombined: false,
                    constraints: {
                        disallowedDays: [],
                        lockedSlots: [],
                    },
                    indicators: [],
                    expectedOutcomes: [],
                    semester: course.semester || "1", // Use row semester, default to "1" if missing
                    createdAt: new Date(),
                };

                await addDoc(coursesRef, courseData);
                successCount++;
            } catch (error) {
                console.error('Error adding course:', error);
                failCount++;
            }

            const currentProgress = Math.round(((i + 1) / total) * 100);
            setProgress(currentProgress);

            const progressBar = document.getElementById('progress-bar');
            const currentSpan = document.getElementById('current');
            if (progressBar) progressBar.style.width = `${currentProgress}%`;
            if (currentSpan) currentSpan.textContent = String(i + 1);
        }

        setIsProcessing(false);

        Swal.fire({
            icon: 'success',
            title: 'นำเข้าข้อมูลเสร็จสิ้น!',
            html: `
                <div class="text-left">
                    <p class="text-green-600">✅ สำเร็จ: ${successCount} รายการ</p>
                    <p class="text-red-600">❌ ล้มเหลว: ${failCount} รายการ</p>
                </div>
            `,
            confirmButtonColor: '#4f46e5',
        }).then(() => {
            navigate('/academic/view-courses');
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ready':
                return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✅ พร้อม</span>;
            case 'warning':
                return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">⚠️ เตือน</span>;
            case 'error':
                return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">❌ ผิดพลาด</span>;
            default:
                return <span className="px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400">รอดำเนินการ</span>;
        }
    };

    const readyCount = previewData.filter(c => c.status === 'ready' || c.status === 'warning').length;
    const warningCount = previewData.filter(c => c.status === 'warning').length;
    const errorCount = previewData.filter(c => c.status === 'error').length;

    return (
        <MainLayout>
            <div className="px-4 sm:px-6 lg:px-8 py-6 min-h-screen bg-slate-50 dark:bg-[#121212] text-slate-900 dark:text-slate-100 transition-colors duration-300">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* --- Header Section --- */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#1e1e1e] p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50">
                        <div className="flex items-center gap-4">
                            <BackButton to="/academic/hub/registration" />
                            <div>
                                <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-white">
                                    <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg">
                                        <FaFileExcel className="text-emerald-600 dark:text-emerald-400" size={24} />
                                    </div>
                                    ประกอบร่างหลักสูตร
                                </h1>
                                <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">อัปโหลดไฟล์ Excel เพื่อนำเข้าข้อมูลหลักสูตรและรายวิชาจำนวนมาก</p>
                            </div>
                        </div>

                        <div className="flex flex-wrap gap-2.5">
                            <div className="relative group inline-block">
                                <button className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm rounded-xl text-white transition-all shadow-sm font-medium border border-transparent">
                                    <FaDownload /> แม่แบบ Excel
                                </button>
                                <div className="absolute top-full right-0 mt-1.5 w-48 bg-white dark:bg-[#2a2b2f] rounded-xl shadow-lg border border-slate-100 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50 overflow-hidden flex flex-col">
                                    <button
                                        onClick={() => handleDownloadTemplate('xlsx')}
                                        className="text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm text-slate-700 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800 font-medium"
                                    >
                                        แบบใหม่ (.xlsx)
                                    </button>
                                    <button
                                        onClick={() => handleDownloadTemplate('xls')}
                                        className="text-left px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm text-slate-700 dark:text-slate-300 font-medium"
                                    >
                                        แบบเก่า (.xls)
                                    </button>
                                </div>
                            </div>

                            <button
                                onClick={() => navigate('/academic/subject-groups')}
                                className="inline-flex items-center gap-2 bg-white dark:bg-[#2a2b2f] px-4 py-2 text-sm rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-sm border border-slate-200 dark:border-slate-700 font-medium"
                            >
                                <FaList /> กลุ่มสาระฯ
                            </button>
                        </div>
                    </div>



                    {/* --- Upload Zone --- */}
                    {!file && (
                        <div
                            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-10 text-center bg-white dark:bg-[#1e1e1e] hover:border-indigo-500 dark:hover:border-indigo-400/70 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5 transition-all duration-300 cursor-pointer shadow-sm"
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                                <FaCloudUploadAlt className="text-3xl text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <h3 className="text-base font-semibold mb-1 text-slate-800 dark:text-slate-200">อัปโหลดไฟล์คลังวิชา</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">คลิกหรือลากไฟล์ .xlsx หรือ .xls มาวางเพื่อเริ่มต้น</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileSelect}
                                className="hidden"
                            />
                        </div>
                    )}

                    {/* --- File Info & Mapping Status --- */}
                    {file && (
                        <div className="bg-white dark:bg-[#1e1e1e] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                                        <FaFileExcel className="text-2xl text-emerald-600 dark:text-emerald-400" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-base text-slate-800 dark:text-slate-200 max-w-[200px] sm:max-w-xs truncate">{file.name}</h3>
                                        <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 w-full sm:w-auto">
                                    {analysisStatus !== 'idle' && (
                                        <div className="flex-1 sm:flex-none flex justify-end">
                                            <button
                                                onClick={openManualMapping}
                                                className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors font-medium border border-indigo-100 dark:border-indigo-500/20"
                                            >
                                                <FaEdit /> แกัไขจับคู่คอลัมน์ ({Object.keys(columnMapping).length}/{REQUIRED_FIELDS.length})
                                            </button>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => {
                                            setFile(null);
                                            setPreviewData([]);
                                            setAnalysisStatus('idle');
                                        }}
                                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                        title="ลบไฟล์และเริ่มใหม่"
                                    >
                                        <FaTimes size={18} />
                                    </button>
                                </div>
                            </div>

                            {/* Alert for Missing Fields */}
                            {analysisStatus === 'missing_fields' && (
                                <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-xl flex items-start gap-3">
                                    <FaExclamationTriangle className="text-amber-500 mt-0.5 shrink-0" />
                                    <div>
                                        <h4 className="text-sm font-medium text-amber-800 dark:text-amber-400">ข้อควรระวัง</h4>
                                        <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">ไฟล์ขาดฟิลด์บังคับ กรุณากด "แก้ไขจับคู่คอลัมน์" เพื่อแก้ไขก่อนบันทึก</p>
                                    </div>
                                </div>
                            )}

                            {/* Checkbox Mapping Summary (Compact) */}
                            {analysisStatus !== 'idle' && (
                                <div className="mt-4 flex flex-wrap gap-2 text-[11px] bg-slate-50 dark:bg-[#121212] p-3 rounded-xl border border-slate-100 dark:border-slate-800/50">
                                    <span className="font-semibold text-slate-600 dark:text-slate-400 w-full mb-1">สถานะฟิลด์ที่ต้องการ:</span>
                                    {REQUIRED_FIELDS.map(field => {
                                        const isMapped = columnMapping[field.key];
                                        return (
                                            <div key={field.key} className={`inline-flex items-center gap-1.5 px-2 py-1 rounded ${isMapped ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : field.required ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 font-medium' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                                                {isMapped ? '✓' : field.required ? '✗' : '○'} {field.label}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Manual Mapping Mode */}
                            {manualMappingMode && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                                    <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                                        {/* Header */}
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/50">
                                            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                                                <FaTable className="text-indigo-500 text-base" />
                                                ตรวจสอบและปรับแต่งคอลัมน์
                                            </h3>
                                            <button
                                                onClick={() => setManualMappingMode(false)}
                                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                                            >
                                                <FaTimes size={18} />
                                            </button>
                                        </div>

                                        {/* Body */}
                                        <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50 dark:bg-[#121212]/50">
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 bg-blue-50 dark:bg-blue-500/10 p-3 rounded-lg border border-blue-100 dark:border-blue-500/20">
                                                กรุณาเลือกคอลัมน์ในไฟล์ Excel ที่ตรงกับข้อมูลในระบบ
                                                (<span className="text-red-500 mx-1">*</span>) หมายถึงฟิลด์ที่บังคับต้องมี
                                            </p>

                                            {/* Mapping Grid */}
                                            <div className="space-y-2">
                                                {excelHeaders.map((header, index) => {
                                                    const mappedField = Object.keys(tempColumnMapping).find(
                                                        key => tempColumnMapping[key] === header
                                                    );

                                                    return (
                                                        <div key={index} className="flex flex-col sm:flex-row gap-3 items-center p-3 bg-white dark:bg-[#1e1e1e] rounded-xl border border-slate-100 dark:border-slate-800 shadow-sm">
                                                            <div className="flex items-center gap-3 w-full sm:w-1/2">
                                                                <span className="w-7 h-7 flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-md font-mono text-xs font-medium shrink-0">
                                                                    {String.fromCharCode(65 + index)}
                                                                </span>
                                                                <span className="font-medium text-sm text-slate-700 dark:text-slate-200 truncate flex-1" title={header}>
                                                                    {header}
                                                                </span>
                                                            </div>

                                                            <div className="hidden sm:flex text-slate-300 dark:text-slate-600">→</div>
                                                            <div className="flex sm:hidden w-full h-px bg-slate-100 dark:bg-slate-800 my-1"></div>

                                                            <div className="w-full sm:w-1/2">
                                                                <select
                                                                    value={mappedField || ''}
                                                                    onChange={(e) => handleManualMapping(header, e.target.value)}
                                                                    className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-[#2a2b2f] text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-colors"
                                                                >
                                                                    <option value="">-- ไม่ใช้งานคอลัมน์นี้ --</option>
                                                                    {REQUIRED_FIELDS.map(field => (
                                                                        <option key={field.key} value={field.key}>
                                                                            {field.label} {field.required && '*'}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        {/* Footer / Action Buttons */}
                                        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800/50 bg-white dark:bg-[#1e1e1e] rounded-b-2xl shrink-0">
                                            <button
                                                onClick={resetMapping}
                                                className="text-sm px-4 py-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors font-medium border border-transparent hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                                            >
                                                ล้างค่า
                                            </button>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => setManualMappingMode(false)}
                                                    className="px-5 py-2 text-sm border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors font-medium"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <button
                                                    onClick={confirmMapping}
                                                    className="px-5 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-medium shadow-sm flex items-center gap-1.5"
                                                >
                                                    <FaCheckCircle size={14} /> บันทึกการจับคู่
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- Preview Data --- */}
                    {previewData.length > 0 && (
                        <div className="space-y-5 animate-in slide-in-from-bottom-4 duration-500">
                            {/* Stats Summary Cards */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                                <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 bg-slate-50 dark:bg-slate-800/50 w-20 h-20 rounded-full group-hover:scale-110 transition-transform"></div>
                                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 z-10 flex items-center gap-1.5">รายการทั้งหมด</div>
                                    <div className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100 z-10">{previewData.length}</div>
                                </div>
                                <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl shadow-sm border border-emerald-100 dark:border-emerald-900/30 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 bg-emerald-50 dark:bg-emerald-900/10 w-20 h-20 rounded-full group-hover:scale-110 transition-transform"></div>
                                    <div className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1 z-10 flex items-center gap-1.5">พร้อมบันทึก</div>
                                    <div className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400 z-10">{readyCount}</div>
                                </div>
                                <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl shadow-sm border border-amber-100 dark:border-amber-900/30 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 bg-amber-50 dark:bg-amber-900/10 w-20 h-20 rounded-full group-hover:scale-110 transition-transform"></div>
                                    <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1 z-10 flex items-center gap-1.5">เตือน/ไม่แน่ใจ</div>
                                    <div className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400 z-10">{warningCount}</div>
                                </div>
                                <div className="bg-white dark:bg-[#1e1e1e] p-4 rounded-2xl shadow-sm border border-rose-100 dark:border-rose-900/30 flex flex-col justify-center relative overflow-hidden group">
                                    <div className="absolute -right-4 -bottom-4 bg-rose-50 dark:bg-rose-900/10 w-20 h-20 rounded-full group-hover:scale-110 transition-transform"></div>
                                    <div className="text-xs font-semibold text-rose-600 dark:text-rose-400 mb-1 z-10 flex items-center gap-1.5">ข้อมูลผิดพลาด</div>
                                    <div className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400 z-10">{errorCount}</div>
                                </div>
                            </div>

                            <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50 flex flex-col">
                                {/* Table Toolbar & Filters */}
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                    <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 hidden sm:block">ตารางตรวจสอบและแก้ไขก่อนบันทึก</h2>
                                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                                        <select
                                            value={selectedSubjectGroup}
                                            onChange={(e) => { setSelectedSubjectGroup(e.target.value); setCurrentPage(1); }}
                                            className="bg-slate-50 dark:bg-[#2a2b2f] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-indigo-500 whitespace-nowrap"
                                        >
                                            <option value="all">กลุ่มสาระ (ทั้งหมด)</option>
                                            {subjectGroups.map(sg => (
                                                <option key={sg} value={sg}>{sg}</option>
                                            ))}
                                        </select>
                                        <select
                                            value={selectedType}
                                            onChange={(e) => { setSelectedType(e.target.value); setCurrentPage(1); }}
                                            className="bg-slate-50 dark:bg-[#2a2b2f] border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-1 focus:ring-indigo-500 whitespace-nowrap"
                                        >
                                            <option value="all">ประเภทวิชา (ทั้งหมด)</option>
                                            {courseTypes.map(ct => (
                                                <option key={ct} value={ct}>{ct}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Table Container */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                                        <thead className="bg-slate-50/50 dark:bg-[#121212]/50 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/50 whitespace-nowrap">
                                            <tr>
                                                <th className="px-5 py-3.5 w-16 text-center">#</th>
                                                <th className="px-5 py-3.5 min-w-[100px]">รหัสวิชา</th>
                                                <th className="px-5 py-3.5 min-w-[200px]">รายละเอียดวิชา</th>
                                                <th className="px-5 py-3.5 min-w-[100px]">ชั้นเรียน</th>
                                                <th className="px-5 py-3.5 text-center">เทอม</th>
                                                <th className="px-5 py-3.5 text-center">หน่วยกิต</th>
                                                <th className="px-5 py-3.5 text-center">คาบ/สัปดาห์</th>
                                                <th className="px-5 py-3.5 min-w-[150px]">สาระ/ประเภท</th>
                                                <th className="px-5 py-3.5 text-center">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 whitespace-nowrap">
                                            {filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((course, index) => (
                                                <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-5 py-4 text-center font-medium">
                                                        {(currentPage - 1) * itemsPerPage + index + 1}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className="font-semibold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-[#2a2b2f] px-2 py-1 rounded text-xs">{course.code || '-'}</span>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]" title={course.title}>{course.title}</div>
                                                        {(course.titleEn || course.codeEn) && (
                                                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]" title={course.titleEn}>
                                                                {course.codeEn ? `[${course.codeEn}] ` : ''}{course.titleEn}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-medium text-slate-700 dark:text-slate-200">{course.classId}</span>
                                                            {course.room && (
                                                                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full text-slate-500">ห้อง {course.room}</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className="w-6 h-6 inline-flex items-center justify-center rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 font-bold text-xs ring-1 ring-blue-100 dark:ring-blue-800/30">
                                                            {course.semester || "-"}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">
                                                            {course.credits !== undefined ? course.credits : (course.hoursPerWeek ? (course.hoursPerWeek / 2) : 0)}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className="font-medium text-sm text-slate-900 dark:text-white">
                                                            {course.hoursPerWeek}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="font-medium text-slate-700 dark:text-slate-200 text-xs mb-0.5">{course.type}</div>
                                                        <div className="text-[11px] text-slate-500 truncate max-w-[150px]" title={course.subjectGroup}>{course.subjectGroup}</div>
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        {getStatusBadge(course.status)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="flex justify-between items-center px-5 py-3 border-t border-slate-100 dark:border-slate-800/50 bg-slate-50/50 dark:bg-[#121212]/30 rounded-b-2xl">
                                        <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                            หน้า <span className="text-slate-900 dark:text-slate-100">{currentPage}</span> จาก <span className="text-slate-900 dark:text-slate-100">{totalPages}</span>
                                        </span>
                                        <div className="flex gap-1.5">
                                            <button
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                                            >
                                                ก่อนหน้า
                                            </button>
                                            <button
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-white dark:bg-[#1e1e1e] border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
                                            >
                                                ถัดไป
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Floating Action Button for Saving */}
                            <div className="fixed sm:sticky bottom-4 sm:bottom-0 left-0 w-full sm:w-auto p-4 sm:p-4 sm:mt-6 sm:bg-transparent bg-white/80 dark:bg-[#121212]/80 backdrop-blur-md border-t sm:border-0 border-slate-200 dark:border-slate-800 z-40 flex justify-center sm:justify-end">
                                <button
                                    onClick={handleSave}
                                    disabled={isProcessing || readyCount === 0}
                                    className="w-full sm:w-auto px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-2xl transition-all duration-300 disabled:opacity-50 disabled:bg-slate-500 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0"
                                >
                                    <FaSave size={18} />
                                    {isProcessing ? 'กำลังดำเนินการบันทึก...' : `ยืนยันนำเข้าข้อมูล (${readyCount} รายการ)`}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ImportCoursePage;
