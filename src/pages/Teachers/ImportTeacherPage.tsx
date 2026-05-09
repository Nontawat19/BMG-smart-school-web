import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import MainLayout from "@/layouts/MainLayout";
import { auth, firestore, firebaseConfig } from '@/firebase';
import { collection, doc, setDoc, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { initializeApp, getApps } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import {
    FaFileUpload, FaFileExcel, FaCheckCircle,
    FaExclamationTriangle, FaTable, FaSave,
    FaTimes, FaCloudUploadAlt, FaDownload, FaArrowLeft, FaEdit, FaUserPlus, FaUsers
} from 'react-icons/fa';
import { useSubjectGroups } from "@/hooks/useSubjectGroups";

// --- Configuration ---
const REQUIRED_FIELDS = [
    { key: 'teacherId', label: 'รหัสครู', required: false },
    { key: 'title', label: 'คำนำหน้า', required: true },
    { key: 'firstName', label: 'ชื่อจริง', required: true },
    { key: 'lastName', label: 'นามสกุล', required: true },
    { key: 'idCardNumber', label: 'เลขบัตรประชาชน', required: true },
    { key: 'email', label: 'อีเมล', required: true },
    { key: 'password', label: 'รหัสผ่าน', required: true },
];

const POSITIONS = ['ครู', 'ครูผู้ช่วย', 'ผู้อำนวยการ', 'รองผู้อำนวยการ'];
const TITLES = ['นาย', 'นาง', 'น.ส.'];

interface MappedTeacher {
    title: string;
    firstName: string;
    lastName: string;
    idCardNumber: string;
    position: string;
    learningArea: string;
    email: string;
    password: string;
    teacherId: string;
    status: 'pending' | 'warning' | 'ready' | 'error';
    errorMessage?: string;
}

export default function ImportTeacherPage() {
    const { schoolId } = useParams<{ schoolId: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const { subjectGroups } = useSubjectGroups(schoolId);

    // --- State ---
    const [file, setFile] = useState<File | null>(null);
    const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [previewData, setPreviewData] = useState<MappedTeacher[]>([]);
    
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'complete' | 'missing_fields' | 'analyzing'>('idle');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);

    const [manualMappingMode, setManualMappingMode] = useState(false);
    const [tempColumnMapping, setTempColumnMapping] = useState<Record<string, string>>({});

    // --- Template Download ---
    const handleDownloadTemplate = (extension: 'xlsx' | 'xls') => {
        const headers = REQUIRED_FIELDS.map(f => f.label + (f.required ? ' *' : ''));
        
        const exampleData = [
            ['T001', 'นาย', 'สมชาย', 'สายเสมอ', '1100123456789', 'somchai@school.com', '123456'],
            ['T002', 'นาง', 'สมศรี', 'ดีงาม', '1100987654321', 'somsri@school.com', '123456'],
        ];

        const worksheetData = [headers, ...exampleData];
        const ws = XLSX.utils.aoa_to_sheet(worksheetData);

        const wscols = headers.map(() => ({ wch: 20 }));
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Teachers_Template");
        XLSX.writeFile(wb, `Teacher_Import_Template.${extension}`);
    };

    // --- File Selection ---
    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) handleFileProcess(selectedFile);
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
            const ws = wb.Sheets[wb.SheetNames[0]];
            const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length > 0) {
                // Strict mapping based on template order
                const headers = data[0].map(h => String(h || '').trim());
                const newMapping: Record<string, string> = {};
                
                REQUIRED_FIELDS.forEach((field, index) => {
                    if (headers[index]) {
                        newMapping[field.key] = headers[index];
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
        reader.readAsBinaryString(file);
    };

    const generatePreview = (mapping: Record<string, string>, rawData: any[], headers: string[]) => {
        const mapped: MappedTeacher[] = rawData.map((row: any) => {
            const rowData: any = {};
            Object.entries(mapping).forEach(([key, header]) => {
                const colIndex = headers.indexOf(header);
                if (colIndex !== -1 && row[colIndex] !== undefined) {
                    rowData[key] = String(row[colIndex]).trim();
                } else {
                    rowData[key] = "";
                }
            });

            let status: 'ready' | 'warning' | 'error' = 'ready';
            let errorMessage = '';

            // Validation
            if (!rowData.firstName || !rowData.lastName || !rowData.email || !rowData.password || !rowData.idCardNumber) {
                status = 'error';
                errorMessage = 'ข้อมูลจำเป็นไม่ครบ';
            } else if (!/^\d{13}$/.test(rowData.idCardNumber)) {
                status = 'error';
                errorMessage = 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก';
            } else if (!rowData.email.includes('@')) {
                status = 'error';
                errorMessage = 'อีเมลไม่ถูกต้อง';
            } else if (rowData.password.length < 6) {
                status = 'error';
                errorMessage = 'รหัสผ่านต้องมีอย่างน้อย 6 ตัว';
            }

            // No warning needed for position/learningArea as they are removed

            return {
                title: rowData.title || "",
                firstName: rowData.firstName || "",
                lastName: rowData.lastName || "",
                idCardNumber: rowData.idCardNumber || "",
                position: rowData.position || "",
                learningArea: rowData.learningArea || "",
                email: rowData.email || "",
                password: rowData.password || "",
                teacherId: rowData.teacherId || "",
                status,
                errorMessage
            };
        }).filter(item => item.firstName || item.email);

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
        let failCount = 0;

        // Initialize secondary auth to prevent logout
        const secondaryApp = getApps().find(app => app.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
        const secondaryAuth = getAuth(secondaryApp);

        Swal.fire({
            title: 'กำลังนำเข้าข้อมูลครู...',
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

        for (let i = 0; i < readyData.length; i++) {
            const teacher = readyData[i];
            try {
                // 1. Check for existing ID Card
                const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
                const qIdCard = query(teachersRef, where("idCardNumber", "==", teacher.idCardNumber));
                const idCardSnap = await getDocs(qIdCard);
                
                if (!idCardSnap.empty) {
                    throw new Error("เลขบัตรประชาชนนี้มีอยู่ในระบบแล้ว");
                }

                // 2. Create Auth User (using secondary auth to avoid session swap)
                const userCredential = await createUserWithEmailAndPassword(secondaryAuth, teacher.email, teacher.password);
                const user = userCredential.user;

                // 3. Save Teacher Doc
                const teacherData = {
                    title: teacher.title,
                    firstName: teacher.firstName,
                    lastName: teacher.lastName,
                    idCardNumber: teacher.idCardNumber,
                    position: "",
                    learningArea: "",
                    email: teacher.email,
                    teacherId: teacher.teacherId,
                    schoolId,
                    uid: user.uid,
                    role: ["teacher"],
                    createdAt: serverTimestamp(),
                };
                await setDoc(doc(firestore, "school-settings", schoolId, "teachers", user.uid), teacherData);

                // 4. Save User Doc
                await setDoc(doc(firestore, "users", user.uid), {
                    fullName: `${teacher.title}${teacher.firstName} ${teacher.lastName}`,
                    email: teacher.email,
                    schoolId: schoolId,
                    role: ["teacher"],
                    createdAt: serverTimestamp(),
                });

                successCount++;
            } catch (error: any) {
                console.error(`Error adding teacher ${teacher.email}:`, error);
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
        Swal.fire({
            icon: successCount > 0 ? 'success' : 'error',
            title: 'นำเข้าข้อมูลเสร็จสิ้น!',
            html: `<div class="text-left"><p class="text-green-600">✅ สำเร็จ: ${successCount} รายการ</p><p class="text-red-600">❌ ล้มเหลว: ${failCount} รายการ</p></div>`,
            confirmButtonColor: '#4f46e5',
        }).then(() => {
            if (successCount > 0) navigate(`/school/${schoolId}/teachers`);
        });
    };

    return (
        <MainLayout>
            <div className="px-4 py-6 min-h-screen bg-slate-50 dark:bg-[#121212] transition-colors">
                <div className="max-w-7xl mx-auto space-y-6">
                    {/* Header */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-[#1e1e1e] p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/50">
                        <div>
                            <button onClick={() => navigate(-1)} className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 mb-2 text-sm font-medium">
                                <FaArrowLeft size={12} className="mr-1.5" /> ย้อนกลับ
                            </button>
                            <h1 className="text-2xl font-bold flex items-center gap-3 text-slate-800 dark:text-white">
                                <div className="p-2 bg-emerald-100 dark:bg-emerald-500/10 rounded-lg">
                                    <FaFileExcel className="text-emerald-600 dark:text-emerald-400" size={24} />
                                </div>
                                นำเข้าข้อมูลคุณครู
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-sm">อัปโหลดไฟล์ Excel เพื่อเพิ่มข้อมูลคุณครูจำนวนมากพร้อมสร้างบัญชีเข้าใช้งาน</p>
                        </div>
                        <div className="flex gap-2.5">
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
                            <h3 className="text-base font-semibold mb-1 text-slate-800 dark:text-slate-200">อัปโหลดไฟล์ข้อมูลครู</h3>
                            <p className="text-slate-500 dark:text-slate-400 text-sm max-w-sm mx-auto">คลิกหรือลากไฟล์ .xlsx หรือ .xls มาวางเพื่อเริ่มต้น</p>
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" />
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
                                                <th className="px-4 py-3 font-semibold">ชื่อ-สกุล</th>
                                                <th className="px-4 py-3 font-semibold">เลขบัตร</th>
                                                <th className="px-4 py-3 font-semibold">อีเมล</th>
                                                <th className="px-4 py-3 font-semibold">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                            {previewData.map((teacher, idx) => (
                                                <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                                                    <td className="px-4 py-3">
                                                        <div className="font-medium text-slate-900 dark:text-slate-200">{teacher.title}{teacher.firstName} {teacher.lastName}</div>
                                                        <div className="text-[10px] text-slate-400">ID: {teacher.teacherId || '-'}</div>
                                                    </td>
                                                    <td className="px-4 py-3 font-mono text-xs">{teacher.idCardNumber}</td>
                                                    <td className="px-4 py-3 text-slate-500">{teacher.email}</td>

                                                    <td className="px-4 py-3">
                                                        {teacher.status === 'ready' ? <span className="text-green-500">พร้อม</span> : 
                                                         teacher.status === 'warning' ? <span className="text-amber-500">คำเตือน</span> : 
                                                         <span className="text-red-500" title={teacher.errorMessage}>ข้อผิดพลาด</span>}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="p-6 bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800/50 flex justify-end">
                                    <button
                                        onClick={handleSave}
                                        disabled={isProcessing || previewData.filter(t => t.status === 'ready' || t.status === 'warning').length === 0}
                                        className="inline-flex items-center gap-3 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200 disabled:opacity-50"
                                    >
                                        {isProcessing ? 'กำลังบันทึก...' : <><FaUserPlus /> นำเข้าข้อมูล {previewData.filter(t => t.status === 'ready' || t.status === 'warning').length} รายการ</>}
                                    </button>
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
                                            value={Object.keys(tempColumnMapping).find(k => k === field.key) ? tempColumnMapping[field.key] : ''}
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
