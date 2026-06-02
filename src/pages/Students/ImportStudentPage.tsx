import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import { firestore } from '@/firebase';
import { collection, doc, setDoc, getDoc, getDocs, query, where, serverTimestamp, addDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import {
    FaFileUpload, FaFileExcel, FaCheckCircle,
    FaExclamationTriangle, FaTable, FaSave,
    FaTimes, FaCloudUploadAlt, FaDownload, FaArrowLeft, FaEdit, FaUserPlus, FaUsers, FaGraduationCap
} from 'react-icons/fa';
import BackButton from "@/components/Shared/BackButton";
import { formatStudentBirthDateThai, isValidBirthDate, normalizeBirthDateInput, toBuddhistBirthDateForSave } from "@/utils/birthDateUtils";
import { updateOwnerAndSchoolCounts } from "@/utils/ownerStatsUtils";
import { updateStudentReportSummaryForChanges } from "@/utils/studentReportSummaryUtils";

// --- Configuration ---
const REQUIRED_FIELDS = [
    { key: 'studentId', label: 'รหัสนักเรียน', required: true },
    { key: 'idCardNumber', label: 'เลขบัตรประจำตัวประชาชน', required: false },
    { key: 'title', label: 'คำนำหน้า', required: true },
    { key: 'firstName', label: 'ชื่อ', required: true },
    { key: 'lastName', label: 'นามสกุล', required: true },
    { key: 'classLevel', label: 'ชั้น', required: true },
    { key: 'room', label: 'ห้อง', required: true },
    { key: 'birthDate', label: 'วันเกิด', required: false },
];

const FIELD_ALIASES: Record<string, string[]> = {
    studentId: ['รหัสนักเรียน', 'เลขประจำตัวนักเรียน', 'studentid', 'student id'],
    idCardNumber: ['เลขบัตรประชาชน', 'เลขประจำตัวประชาชน', 'เลขบัตรประจำตัวประชาชน', 'บัตรประชาชน', 'เลข 13 หลัก', 'เลข13หลัก', 'idcard', 'id card', 'nationalid', 'national id', 'citizenid', 'citizen id'],
    title: ['คำนำหน้า', 'คำนำหน้าชื่อ', 'prefix', 'title'],
    firstName: ['ชื่อ', 'ชื่อนักเรียน', 'firstname', 'first name'],
    lastName: ['นามสกุล', 'สกุล', 'lastname', 'last name'],
    classLevel: ['ชั้น', 'ระดับชั้น', 'classlevel', 'class level', 'class'],
    room: ['ห้อง', 'ห้องเรียน', 'room'],
    birthDate: ['วันเกิด', 'วัน/เดือน/ปีเกิด', 'วันเดือนปีเกิด', 'ว/ด/ปเกิด', 'ว.ด.ป.เกิด', 'birthdate', 'birth date', 'dob', 'dateofbirth'],
};

const normalizeHeader = (value: unknown) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()._-]/g, '');

const findMatchingHeader = (headers: string[], field: { key: string; label: string }) => {
    const aliases = [field.label, field.key, ...(FIELD_ALIASES[field.key] || [])].map(normalizeHeader);
    return headers.find((header) => {
        const normalizedHeader = normalizeHeader(header);
        return aliases.some((alias) => normalizedHeader === alias || normalizedHeader.includes(alias) || alias.includes(normalizedHeader));
    });
};

const normalizeDigitValue = (value: unknown, maxLength?: number) => {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    return maxLength ? digits.slice(0, maxLength) : digits;
};

interface MappedStudent {
    studentId: string;
    idCardNumber?: string;
    title: string;
    firstName: string;
    lastName: string;
    classLevel: string;
    room: string;
    birthDate?: string;
    status: 'pending' | 'warning' | 'ready' | 'error';
    errorMessage?: string;
}

export default function ImportStudentPage() {
    const { schoolId } = useParams<{ schoolId: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- State ---
    const [file, setFile] = useState<File | null>(null);
    const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [previewData, setPreviewData] = useState<MappedStudent[]>([]);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'complete' | 'missing_fields' | 'analyzing'>('idle');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    const [manualMappingMode, setManualMappingMode] = useState(false);
    const [tempColumnMapping, setTempColumnMapping] = useState<Record<string, string>>({});

    // --- Template Download ---
    const handleDownloadTemplate = (extension: 'xlsx' | 'xls' | 'csv') => {
        const headers = REQUIRED_FIELDS.map(f => f.label);
        
        const exampleData = [
            ['01234', '1234567890123', 'เด็กชาย', 'สมชาย', 'ใจดี', 'ป.1', '1', '2553-05-24'],
            ['01235', '1234567890124', 'เด็กหญิง', 'สมศรี', 'ดีงาม', 'ป.1', '2', '2553-08-12'],
        ];

        const worksheetData = [headers, ...exampleData];

        if (extension === 'csv') {
            const csv = worksheetData
                .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
                .join('\n');
            const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Student_Import_Template.csv';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return;
        }

        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        const wscols = headers.map((header) => ({ wch: header === 'เลขบัตรประจำตัวประชาชน' ? 24 : 15 }));
        ws['!cols'] = wscols;

        exampleData.forEach((_, rowIndex) => {
            const idCardCell = XLSX.utils.encode_cell({ r: rowIndex + 1, c: 1 });
            if (ws[idCardCell]) ws[idCardCell].t = 's';
        });

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Students_Template");
        XLSX.writeFile(wb, `Student_Import_Template.${extension}`);
    };

    // --- File Selection ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) handleFileProcess(selectedFile);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const selectedFile = e.dataTransfer.files?.[0];
        if (selectedFile && (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls') || selectedFile.name.endsWith('.csv'))) {
            handleFileProcess(selectedFile);
        } else {
            Swal.fire('ไฟล์ไม่ถูกต้อง', 'กรุณาอัปโหลดไฟล์ (.xlsx, .xls, .csv) เท่านั้น', 'warning');
        }
    };

    const handleFileProcess = (file: File) => {
        setFile(file);
        setIsAnalyzing(true);
        setAnalysisStatus('analyzing');
        setPreviewData([]);

        const reader = new FileReader();
        reader.onload = (e) => {
            const isCsv = file.name.toLowerCase().endsWith('.csv');
            const wb = XLSX.read(e.target?.result, { type: isCsv ? 'string' : 'binary', cellDates: true });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length > 0) {
                const headers = data[0].map(h => String(h || '').trim());
                const newMapping: Record<string, string> = {};
                
                // Try to auto-map based on headers
                REQUIRED_FIELDS.forEach((field) => {
                    const match = findMatchingHeader(headers, field);
                    if (match) {
                        newMapping[field.key] = match;
                    }
                });

                setExcelHeaders(headers);
                setExcelData(data.slice(1));
                setColumnMapping(newMapping);
                setIsAnalyzing(false);
                setAnalysisStatus('complete');
                generatePreview(newMapping, data.slice(1), headers);
            }
        };
        if (file.name.toLowerCase().endsWith('.csv')) {
            reader.readAsText(file, 'utf-8');
        } else {
            reader.readAsBinaryString(file);
        }
    };

    const generatePreview = (mapping: Record<string, string>, rawData: any[], headers: string[]) => {
        const mapped: MappedStudent[] = rawData.map((row: any) => {
            const rowData: any = {};
            Object.entries(mapping).forEach(([key, header]) => {
                const colIndex = headers.indexOf(header);
                if (colIndex !== -1 && row[colIndex] !== undefined) {
                    const rawValue = row[colIndex];
                    rowData[key] = key === 'birthDate' ? rawValue : String(rawValue).trim();
                } else {
                    rowData[key] = "";
                }
            });

            // Student ID Padding Logic
            if (rowData.studentId) {
                let sid = rowData.studentId.toString().trim();
                if (sid.length === 4) {
                    sid = '0' + sid;
                }
                rowData.studentId = sid;
            }

            if (rowData.idCardNumber) {
                rowData.idCardNumber = normalizeDigitValue(rowData.idCardNumber, 13);
            }

            let status: 'ready' | 'warning' | 'error' = 'ready';
            let errorMessage = '';

            // Validation
            if (!rowData.studentId || !rowData.firstName || !rowData.lastName || !rowData.classLevel || !rowData.room) {
                status = 'error';
                errorMessage = 'ข้อมูลจำเป็นไม่ครบ';
            }

            const normalizedBirthDate = normalizeBirthDateInput(rowData.birthDate);
            const savedBirthDate = rowData.birthDate ? toBuddhistBirthDateForSave(normalizedBirthDate) : "";
            if (rowData.birthDate && !isValidBirthDate(normalizedBirthDate)) {
                status = status === 'error' ? status : 'warning';
                errorMessage = errorMessage || 'รูปแบบวันเกิดไม่ถูกต้อง';
            }

            return {
                studentId: rowData.studentId || "",
                idCardNumber: rowData.idCardNumber || "",
                title: rowData.title || "",
                firstName: rowData.firstName || "",
                lastName: rowData.lastName || "",
                classLevel: rowData.classLevel || "",
                room: rowData.room || "",
                birthDate: savedBirthDate,
                status,
                errorMessage
            };
        }).filter(item => item.studentId || item.firstName);

        setPreviewData(mapped);
    };

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

    const handleManualMapping = (excelColumn: string, systemField: string) => {
        setTempColumnMapping(prev => {
            const newMapping = { ...prev };
            Object.keys(newMapping).forEach(key => {
                if (newMapping[key] === excelColumn) delete newMapping[key];
            });
            if (systemField !== '') newMapping[systemField] = excelColumn;
            return newMapping;
        });
    };

    const openManualMapping = () => {
        setTempColumnMapping(columnMapping);
        setManualMappingMode(true);
    };

    const confirmMapping = () => {
        const requiredFields = REQUIRED_FIELDS.filter(f => f.required);
        const missingFields = requiredFields.filter(f => !tempColumnMapping[f.key]);
        if (missingFields.length > 0) {
            Swal.fire('ฟิลด์บังคับยังไม่ครบ', `กรุณาเลือก: ${missingFields.map(f => f.label).join(', ')}`, 'warning');
            return;
        }
        setColumnMapping(tempColumnMapping);
        setManualMappingMode(false);
    };

    // --- Save Logic ---
    const handleSave = async () => {
        if (!schoolId) return;

        const readyData = previewData.filter(t => t.status === 'ready' || t.status === 'warning');
        if (readyData.length === 0) {
            Swal.fire('ไม่มีข้อมูลที่พร้อมนำเข้า', 'กรุณาตรวจสอบข้อผิดพลาด', 'warning');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        let successCount = 0;
        let updateCount = 0;
        let failCount = 0;

        Swal.fire({
            title: 'กำลังนำเข้าข้อมูลนักเรียน...',
            html: `<div class="text-center">
                <p class="mb-4">กำลังประมวลผล <span id="current">0</span>/${readyData.length} รายการ</p>
                <div class="w-full bg-gray-200 rounded-full h-2.5">
                    <div id="progress-bar" class="bg-indigo-600 h-2.5 rounded-full" style="width: 0%"></div>
                </div>
            </div>`,
            allowOutsideClick: false,
            showConfirmButton: false,
            didOpen: () => Swal.showLoading(),
        });

        const studentsRef = collection(firestore, "school-settings", schoolId, "students");
        const studentSummaryChanges: Array<{ before?: any | null; after?: any | null }> = [];

        for (let i = 0; i < readyData.length; i++) {
            const student = readyData[i];
            try {
                // 1. Check for existing student by studentId
                const qId = query(studentsRef, where("studentId", "==", student.studentId));
                const snapshotId = await getDocs(qId);
                
                const studentData: Record<string, any> = {
                    studentId: student.studentId,
                    title: student.title,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    classLevel: student.classLevel,
                    room: student.room,
                    schoolId: schoolId,
                    updatedAt: serverTimestamp(),
                };
                if (student.birthDate) {
                    studentData.birthDate = toBuddhistBirthDateForSave(student.birthDate);
                }
                if (student.idCardNumber) {
                    studentData.idCardNumber = student.idCardNumber;
                }

                let existingDoc = !snapshotId.empty ? snapshotId.docs[0] : null;
                if (!existingDoc && student.idCardNumber) {
                    const qCard = query(studentsRef, where("idCardNumber", "==", student.idCardNumber));
                    const snapshotCard = await getDocs(qCard);
                    if (!snapshotCard.empty) {
                        existingDoc = snapshotCard.docs[0];
                    }
                }

                if (existingDoc) {
                    // Update existing
                    const docId = existingDoc.id;
                    const beforeData = { id: docId, ...existingDoc.data() };
                    const afterData = { ...beforeData, ...studentData };
                    await setDoc(doc(studentsRef, docId), studentData, { merge: true });
                    studentSummaryChanges.push({ before: beforeData, after: afterData });
                    try {
                        const { updateStudentLookup } = await import("@/utils/studentLookupUtils");
                        await updateStudentLookup(studentData.idCardNumber, studentData.studentId, schoolId, docId);
                    } catch (lookupErr) {
                        console.warn("Failed to update student lookup table:", lookupErr);
                    }
                    updateCount++;
                } else {
                    // Create new
                    const createdStudent = {
                        ...studentData,
                        studentStatus: 'กำลังศึกษาอยู่',
                        behaviorScore: 100,
                        createdAt: serverTimestamp(),
                        role: ["student"]
                    };
                    const docRef = await addDoc(studentsRef, createdStudent);
                    try {
                        const { updateStudentLookup } = await import("@/utils/studentLookupUtils");
                        await updateStudentLookup(studentData.idCardNumber, studentData.studentId, schoolId, docRef.id);
                    } catch (lookupErr) {
                        console.warn("Failed to update student lookup table:", lookupErr);
                    }
                    studentSummaryChanges.push({ before: null, after: createdStudent });
                    successCount++;
                }

            } catch (error: any) {
                console.error(`Error adding student ${student.studentId}:`, error);
                failCount++;
            }

            const currentProgress = Math.round(((i + 1) / readyData.length) * 100);
            setProgress(currentProgress);
            const progressBar = document.getElementById('progress-bar');
            const currentSpan = document.getElementById('current');
            if (progressBar) progressBar.style.width = `${currentProgress}%`;
            if (currentSpan) currentSpan.textContent = String(i + 1);
        }

        setIsProcessing(false);
        if (successCount > 0) {
            await updateOwnerAndSchoolCounts(firestore, schoolId, { students: successCount });
        }
        if (studentSummaryChanges.length > 0) {
            await updateStudentReportSummaryForChanges(firestore, schoolId, studentSummaryChanges);
        }
        Swal.fire({
            icon: (successCount + updateCount) > 0 ? 'success' : 'error',
            title: 'นำเข้าข้อมูลเสร็จสิ้น!',
            html: `<div class="text-left">
                <p class="text-green-600">✅ เพิ่มใหม่: ${successCount} รายการ</p>
                <p class="text-indigo-600">🔄 อัปเดต: ${updateCount} รายการ</p>
                <p class="text-red-600">❌ ล้มเหลว: ${failCount} รายการ</p>
            </div>`,
            confirmButtonColor: '#4f46e5',
        }).then(() => {
            if ((successCount + updateCount) > 0) navigate(`/school/${schoolId}/students`);
        });
    };

    return (
        <MainLayout>
            <div className="px-4 py-6 min-h-screen bg-slate-50 dark:bg-[#121212] transition-colors">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#1e1e1e] p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50">
                        <div>
                            <BackButton to="/academic/hub/students" />
                            <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-white mt-4">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-500/10 rounded-lg">
                                    <FaFileExcel className="text-indigo-600 dark:text-indigo-400" size={24} />
                                </div>
                                นำเข้าข้อมูลนักเรียน (Bulk)
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">อัปโหลดไฟล์ Excel เพื่อเพิ่มหรืออัปเดตข้อมูลนักเรียนจำนวนมาก</p>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            <button onClick={() => handleDownloadTemplate('xlsx')} className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 px-4 py-2 text-sm rounded-xl text-white transition-all shadow-sm font-medium">
                                <FaDownload /> แม่แบบ Excel
                            </button>
                        </div>
                    </div>

                    {/* Upload Zone */}
                    {!file && (
                        <div 
                            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-10 text-center bg-white dark:bg-[#1e1e1e] hover:border-indigo-500 hover:bg-indigo-50/50 transition-all cursor-pointer shadow-sm"
                            onDrop={handleDrop}
                            onDragOver={(e) => e.preventDefault()}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-500/10 flex items-center justify-center mx-auto mb-4">
                                <FaCloudUploadAlt className="text-3xl text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <h3 className="text-base font-semibold mb-1 text-slate-800 dark:text-slate-200">อัปโหลดไฟล์ข้อมูลนักเรียน</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">คลิกหรือลากไฟล์ .xlsx, .xls หรือ .csv มาวางเพื่อเริ่มต้น</p>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} className="hidden" />
                        </div>
                    )}

                    {/* File Info & Preview */}
                    {file && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-[#1e1e1e] p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-emerald-100 dark:bg-emerald-500/10 rounded-xl">
                                            <FaFileExcel className="text-2xl text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-base text-slate-800 dark:text-slate-200">{file.name}</h3>
                                            <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(2)} KB</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={handleSave}
                                            disabled={isProcessing || previewData.filter(t => t.status === 'ready' || t.status === 'warning').length === 0}
                                            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 px-4 py-1.5 text-sm rounded-lg text-white transition-all shadow-sm font-bold disabled:opacity-50"
                                        >
                                            {isProcessing ? 'กำลังบันทึก...' : <><FaUserPlus /> นำเข้าข้อมูล {previewData.filter(t => t.status === 'ready' || t.status === 'warning').length} รายการ</>}
                                        </button>
                                        <button onClick={openManualMapping} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
                                            <FaEdit /> ตั้งค่าคอลัมน์
                                        </button>
                                        <button onClick={() => { setFile(null); setPreviewData([]); }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                                            <FaTimes size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Preview Table */}
                            <div className="bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50 overflow-hidden">
                                <div className="p-4 border-b border-slate-100 dark:border-slate-800/50 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/20">
                                    <h3 className="font-bold flex items-center gap-2">
                                        <FaTable className="text-indigo-500" /> ข้อมูลที่พบในไฟล์ ({previewData.length} รายการ)
                                    </h3>
                                    <div className="flex gap-4">
                                        <span className="text-xs text-green-600 font-medium">พร้อม: {previewData.filter(t => t.status === 'ready' || t.status === 'warning').length}</span>
                                        <span className="text-xs text-red-600 font-medium">ข้อผิดพลาด: {previewData.filter(t => t.status === 'error').length}</span>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[500px]">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-slate-50 dark:bg-slate-800/40 text-slate-500 sticky top-0 z-10">
                                            <tr>
                                                <th className="px-4 py-3 font-semibold">รหัสนักเรียน</th>
                                                <th className="px-4 py-3 font-semibold">เลขบัตรประชาชน</th>
                                                <th className="px-4 py-3 font-semibold">ชื่อ-นามสกุล</th>
                                                <th className="px-4 py-3 font-semibold">ระดับชั้น</th>
                                                <th className="px-4 py-3 font-semibold">ห้อง</th>
                                                <th className="px-4 py-3 font-semibold">วันเกิด</th>
                                                <th className="px-4 py-3 font-semibold">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                            {previewData.map((student, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                                    <td className="px-4 py-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">{student.studentId}</td>
                                                    <td className="px-4 py-3 font-mono text-slate-500">{student.idCardNumber || '-'}</td>
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-slate-900 dark:text-slate-200">{student.title}{student.firstName} {student.lastName}</div>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500">{student.classLevel}</td>
                                                    <td className="px-4 py-3 text-slate-500">{student.room}</td>
                                                    <td className="px-4 py-3 text-slate-500">{formatStudentBirthDateThai(student.birthDate)}</td>
                                                    <td className="px-4 py-3">
                                                        {student.status === 'ready' ? <span className="text-green-500">พร้อม</span> : 
                                                         student.status === 'warning' ? <span className="text-amber-500">คำเตือน</span> : 
                                                         <span className="text-red-500" title={student.errorMessage}>ข้อผิดพลาด</span>}
                                                    </td>
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

            {/* Manual Mapping Modal */}
            {manualMappingMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white dark:bg-[#1e1e1e] w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800/50">
                            <h3 className="text-lg font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                                <FaTable className="text-indigo-500" /> ปรับแต่งการจับคู่คอลัมน์
                            </h3>
                            <button onClick={() => setManualMappingMode(false)} className="text-slate-400 hover:text-slate-600"><FaTimes size={18} /></button>
                        </div>
                        <div className="p-6 overflow-y-auto flex-1 space-y-3">
                            {REQUIRED_FIELDS.map((field) => (
                                <div key={field.key} className="flex flex-col sm:flex-row gap-3 items-center p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/50">
                                    <div className="w-full sm:w-1/2 font-medium text-sm text-slate-700 dark:text-slate-200">
                                        {field.label} {field.required && <span className="text-red-500">*</span>}
                                    </div>
                                    <div className="w-full sm:w-1/2">
                                        <select
                                            value={tempColumnMapping[field.key] || ''}
                                            onChange={(e) => handleManualMapping(e.target.value, field.key)}
                                            className="w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-[#2a2b2f] text-slate-800 dark:text-slate-200"
                                        >
                                            <option value="">-- เลือกคอลัมน์จาก Excel --</option>
                                            {excelHeaders.map((h, i) => <option key={i} value={h}>{h}</option>)}
                                        </select>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="p-6 border-t border-slate-100 dark:border-slate-800/50 flex justify-end gap-3">
                            <button onClick={() => setManualMappingMode(false)} className="px-4 py-2 text-sm font-medium text-slate-500">ยกเลิก</button>
                            <button onClick={confirmMapping} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md">ยืนยันการจับคู่</button>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
}
