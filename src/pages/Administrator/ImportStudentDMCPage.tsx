import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getLevelsByRange } from '@/utils/schoolUtils';
import MainLayout from "@/layouts/MainLayout";
import { firestore } from '@/firebase';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import Swal from 'sweetalert2';
import {
    FaFileUpload, FaFileExcel, FaCheckCircle,
    FaExclamationTriangle, FaTable, FaSave,
    FaMagic, FaTimes, FaCloudUploadAlt, FaChevronRight
} from 'react-icons/fa';

/**
 * Helper สำหรับจัดรูปแบบชื่อเต็มในหน้า Preview (ป้องกันคำนำหน้าซ้ำซ้อน)
 */
const formatFullName = (title?: string, firstName?: string, lastName?: string): string => {
    const t = (title || "").trim();
    const f = (firstName || "").trim();
    const l = (lastName || "").trim();

    if (!f && !t) return "-";

    const commonTitles = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส."];
    // เช็คว่าชื่อเริ่มต้นด้วยคำนำหน้าอยู่แล้วหรือไม่
    const startsWithTitle = commonTitles.some(prefix => f.startsWith(prefix)) || (t && f.startsWith(t));

    let result = "";
    if (startsWithTitle) {
        // ถ้าชื่อมีคำนำหน้าแล้ว ใช้ชื่อนั้นเลย
        result = `${f} ${l}`;
    } else {
        // ถ้าไม่มี ให้เอาคำนำหน้ามาต่อ (เว้น 1 เคาะเพื่อความสวยงาม)
        const titlePart = t ? `${t} ` : "";
        result = `${titlePart}${f} ${l}`;
    }

    return result.replace(/\s+/g, ' ').trim() || "-";
};

// --- Configuration ---
// --- Configuration ---
const REQUIRED_FIELDS = [
    // Identity & Academic
    { key: 'studentId', label: 'รหัสนักเรียน', required: true },
    { key: 'idCardNumber', label: 'เลขประจำตัวประชาชน', required: true },
    { key: 'title', label: 'คำนำหน้าชื่อ', required: false },
    { key: 'firstName', label: 'ชื่อ', required: true },
    { key: 'lastName', label: 'นามสกุล', required: true },
    { key: 'firstNameEn', label: 'ชื่อ (อังกฤษ)', required: false },
    { key: 'lastNameEn', label: 'นามสกุล (อังกฤษ)', required: false },
    { key: 'nickname', label: 'ชื่อเล่น', required: false },
    { key: 'classLevel', label: 'ชั้น', required: true },
    { key: 'room', label: 'ห้อง', required: false },
    { key: 'studentNumber', label: 'เลขที่', required: false },
    { key: 'gender', label: 'เพศ', required: false },
    { key: 'birthDate', label: 'วันเกิด', required: false },
    { key: 'ageYear', label: 'อายุ (ปี)', required: false },
    { key: 'ageMonth', label: 'อายุ (เดือน)', required: false },
    { key: 'bloodType', label: 'หมู่โลหิต', required: false },
    { key: 'nationality', label: 'สัญชาติ', required: false },
    { key: 'race', label: 'เชื้อชาติ', required: false },
    { key: 'religion', label: 'ศาสนา', required: false },
    { key: 'birthProvince', label: 'จังหวัดที่เกิด', required: false },

    // Family & Status
    { key: 'elderBrotherCount', label: 'จำนวนพี่ชาย', required: false },
    { key: 'youngerBrotherCount', label: 'จำนวนน้องชาย', required: false },
    { key: 'elderSisterCount', label: 'จำนวนพี่สาว', required: false },
    { key: 'youngerSisterCount', label: 'จำนวนน้องสาว', required: false },
    { key: 'childOrder', label: 'เป็นบุตรคนที่', required: false },
    { key: 'childOrderInCategory', label: 'เป็นบุตร/ธิดาลำดับที่', required: false },
    { key: 'studyingSiblingCount', label: 'จำนวนพี่น้องที่ศึกษาอยู่', required: false },
    { key: 'parentsMaritalStatus', label: 'สถานภาพสมรสบิดามารดา', required: false },

    // Father
    { key: 'fatherIdNumber', label: 'เลขบัตรประชาชนบิดา', required: false },
    { key: 'fatherTitle', label: 'คำนำหน้าชื่อบิดา', required: false },
    { key: 'fatherFirstName', label: 'ชื่อบิดา', required: false },
    { key: 'fatherLastName', label: 'นามสกุลบิดา', required: false },
    { key: 'fatherOccupation', label: 'อาชีพบิดา', required: false },
    { key: 'fatherMonthlyIncome', label: 'รายได้บิดา', required: false },
    { key: 'fatherPhone', label: 'เบอร์โทรบิดา', required: false },

    // Mother
    { key: 'motherIdNumber', label: 'เลขบัตรประชาชนมารดา', required: false },
    { key: 'motherTitle', label: 'คำนำหน้าชื่อมารดา', required: false },
    { key: 'motherFirstName', label: 'ชื่อมารดา', required: false },
    { key: 'motherLastName', label: 'นามสกุลมารดา', required: false },
    { key: 'motherOccupation', label: 'อาชีพมารดา', required: false },
    { key: 'motherMonthlyIncome', label: 'รายได้มารดา', required: false },
    { key: 'motherPhone', label: 'เบอร์โทรมารดา', required: false },

    // Guardian
    { key: 'guardianRelationship', label: 'ความสัมพันธ์ผู้ปกครอง', required: false },
    { key: 'guardianIdNumber', label: 'เลขบัตรประชาชนผู้ปกครอง', required: false },
    { key: 'guardianTitle', label: 'คำนำหน้าผู้ปกครอง', required: false },
    { key: 'guardianFirstName', label: 'ชื่อผู้ปกครอง', required: false },
    { key: 'guardianLastName', label: 'นามสกุลผู้ปกครอง', required: false },
    { key: 'guardianOccupation', label: 'อาชีพผู้ปกครอง', required: false },
    { key: 'guardianMonthlyIncome', label: 'รายได้ผู้ปกครอง', required: false },
    { key: 'guardianPhone', label: 'เบอร์โทรผู้ปกครอง', required: false },

    // Registered Address
    { key: 'regHouseId', label: 'รหัสประจำบ้าน (ทะเบียนบ้าน)', required: false },
    { key: 'regAddressNumber', label: 'เลขที่บ้าน (ทะเบียนบ้าน)', required: false },
    { key: 'regMoo', label: 'หมู่ (ทะเบียนบ้าน)', required: false },
    { key: 'regRoad', label: 'ถนน (ทะเบียนบ้าน)', required: false },
    { key: 'regSubDistrict', label: 'ตำบล (ทะเบียนบ้าน)', required: false },
    { key: 'regDistrict', label: 'อำเภอ (ทะเบียนบ้าน)', required: false },
    { key: 'regProvince', label: 'จังหวัด (ทะเบียนบ้าน)', required: false },
    { key: 'regZipCode', label: 'รหัสไปรษณีย์ (ทะเบียนบ้าน)', required: false },
    { key: 'regPhone', label: 'เบอร์โทร (ทะเบียนบ้าน)', required: false },

    // Current Address
    { key: 'curHouseId', label: 'รหัสประจำบ้าน (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curAddressNumber', label: 'เลขที่บ้าน (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curMoo', label: 'หมู่ (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curRoad', label: 'ถนน (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curSubDistrict', label: 'ตำบล (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curDistrict', label: 'อำเภอ (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curProvince', label: 'จังหวัด (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curZipCode', label: 'รหัสไปรษณีย์ (ที่อยู่ปัจจุบัน)', required: false },
    { key: 'curPhone', label: 'เบอร์โทร (ที่อยู่ปัจจุบัน)', required: false },

    // Health & Welfare
    { key: 'weight', label: 'น้ำหนัก', required: false },
    { key: 'height', label: 'ส่วนสูง', required: false },
    { key: 'disadvantageType', label: 'ความด้อยโอกาส', required: false },
    { key: 'staysAtSchool', label: 'การพักนอน', required: false },
    { key: 'lacksUniform', label: 'ขาดเครี่องแบบ', required: false },
    { key: 'lacksStationery', label: 'ขาดเครื่องเขียน', required: false },
    { key: 'lacksTextbook', label: 'ขาดแบบเรียน', required: false },
    { key: 'lacksLunch', label: 'ขาดอาหารกลางวัน', required: false },
    { key: 'disabilityType', label: 'ความพิการ', required: false },

    // Travel & Academic Stats
    { key: 'distanceDirtRoad', label: 'ระยะทาง (ลูกรัง)', required: false },
    { key: 'distancePavedRoad', label: 'ระยะทาง (ลาดยาง)', required: false },
    { key: 'distanceWaterway', label: 'ระยะทาง (น้ำ)', required: false },
    { key: 'travelTime', label: 'ระยะเวลาเดินทาง', required: false },
    { key: 'travelMethod', label: 'ลักษณะการเดินทาง', required: false },
    { key: 'studentType', label: 'ประเภทนักเรียน', required: false },
    { key: 'gpa', label: 'GPA', required: false },
    { key: 'gpax', label: 'GPAX', required: false },

    // DMC Specific / Extra
    { key: 'elderBrotherCount1', label: 'จำนวนพี่ชาย.1', required: false },
    { key: 'youngerBrotherCount1', label: 'จำนวนน้องชาย.1', required: false },
    { key: 'youngerBrotherCount2', label: 'จำนวนน้องชาย.2', required: false },
    { key: 'youngerSisterCount1', label: 'จำนวนน้องสาว.1', required: false },
    { key: 'subSchoolId', label: 'รหัสโรงเรียนสาขา', required: false },
    { key: 'subSchoolName', label: 'ชื่อโรงเรียนสาขา', required: false },
];

interface MappedData {
    // Basic Info
    studentId: string;
    idCardNumber: string;
    title: string;
    firstName: string;
    lastName: string;
    firstNameEn?: string;
    lastNameEn?: string;
    nickname?: string;
    classLevel: string;
    room: string;
    studentNumber?: string;
    gender?: string;
    birthDate?: string;
    ageYear?: string;
    ageMonth?: string;
    bloodType?: string;
    nationality?: string;
    race?: string;
    religion?: string;
    birthProvince?: string;

    // Family
    elderBrotherCount?: string;
    youngerBrotherCount?: string;
    elderSisterCount?: string;
    youngerSisterCount?: string;
    childOrder?: string;
    childOrderInCategory?: string;
    studyingSiblingCount?: string;
    parentsMaritalStatus?: string;

    // Father
    fatherIdNumber?: string;
    fatherTitle?: string;
    fatherFirstName?: string;
    fatherLastName?: string;
    fatherOccupation?: string;
    fatherMonthlyIncome?: string;
    fatherPhone?: string;

    // Mother
    motherIdNumber?: string;
    motherTitle?: string;
    motherFirstName?: string;
    motherLastName?: string;
    motherOccupation?: string;
    motherMonthlyIncome?: string;
    motherPhone?: string;

    // Guardian
    guardianRelationship?: string;
    guardianIdNumber?: string;
    guardianTitle?: string;
    guardianFirstName?: string;
    guardianLastName?: string;
    guardianOccupation?: string;
    guardianMonthlyIncome?: string;
    guardianPhone?: string;

    // Address (Reg)
    regHouseId?: string;
    regAddressNumber?: string;
    regMoo?: string;
    regRoad?: string;
    regSubDistrict?: string;
    regDistrict?: string;
    regProvince?: string;
    regZipCode?: string;
    regPhone?: string;

    // Address (Cur)
    curHouseId?: string;
    curAddressNumber?: string;
    curMoo?: string;
    curRoad?: string;
    curSubDistrict?: string;
    curDistrict?: string;
    curProvince?: string;
    curZipCode?: string;
    curPhone?: string;

    // Health / Welfare
    weight?: string;
    height?: string;
    disadvantageType?: string;
    staysAtSchool?: string;
    lacksUniform?: boolean;
    lacksStationery?: boolean;
    lacksTextbook?: boolean;
    lacksLunch?: boolean;
    disabilityType?: string;

    // Travel / Academic
    distanceDirtRoad?: string;
    distancePavedRoad?: string;
    distanceWaterway?: string;
    travelTime?: string;
    travelMethod?: string;
    studentType?: string;
    gpa?: string;
    gpax?: string;

    // DMC Extra
    elderBrotherCount1?: string;
    youngerBrotherCount1?: string;
    youngerBrotherCount2?: string;
    youngerSisterCount1?: string;
    subSchoolId?: string;
    subSchoolName?: string;

    status: 'pending' | 'duplicate' | 'ready';
}

const ImportStudentDMCPage: React.FC = () => {
    const { schoolId } = useParams<{ schoolId: string }>();
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- State ---
    const [file, setFile] = useState<File | null>(null);
    const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
    const [excelData, setExcelData] = useState<any[]>([]);
    const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
    const [previewData, setPreviewData] = useState<MappedData[]>([]);
    const [availableLevels, setAvailableLevels] = useState<string[]>([]);

    // Status Flags
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'complete' | 'missing_fields' | 'analyzing'>('idle');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0); // Add progress state

    // Filter States
    const [selectedClassLevel, setSelectedClassLevel] = useState<string>('all');
    const [selectedRoom, setSelectedRoom] = useState<string>('all');
    const [currentPage, setCurrentPage] = useState<number>(1);
    const itemsPerPage = 20;
    const tableContainerRef = useRef<HTMLDivElement>(null);

    // Filtered data calculation
    const filteredData = previewData.filter(student => {
        if (selectedClassLevel !== 'all' && student.classLevel !== selectedClassLevel) return false;
        if (selectedRoom !== 'all' && student.room !== selectedRoom) return false;
        return true;
    });

    const totalPages = Math.ceil(filteredData.length / itemsPerPage);

    useEffect(() => {
        const fetchLevels = async () => {
            if (!schoolId) return;
            try {
                const schoolSnap = await getDoc(doc(firestore, "school-settings", schoolId));
                if (schoolSnap.exists()) {
                    const levels = getLevelsByRange(schoolSnap.data().opportunityExpansionLevel || "");
                    setAvailableLevels(levels);
                }
            } catch (error) {
                console.error("Error fetching school levels:", error);
            }
        };
        fetchLevels();
    }, [schoolId]);

    // Auto-scroll to top of table on page change
    useEffect(() => {
        if (tableContainerRef.current) {
            tableContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [currentPage]);

    // Generate page numbers for pagination
    const getPageNumbers = () => {
        const pages = [];
        const maxVisiblePages = 5;

        if (totalPages <= maxVisiblePages) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            let start = Math.max(1, currentPage - 2);
            let end = Math.min(totalPages, start + 4);

            if (end === totalPages) start = Math.max(1, end - 4);

            if (start > 1) {
                pages.push(1);
                if (start > 2) pages.push('...');
            }

            for (let i = start; i <= end; i++) {
                pages.push(i);
            }

            if (end < totalPages) {
                if (end < totalPages - 1) pages.push('...');
                pages.push(totalPages);
            }
        }
        return pages;
    };


    // --- Logic ---

    // 1. File Handling
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
        setAnalysisStatus('idle');
        setPreviewData([]);

        const reader = new FileReader();
        if (reader.readyState === 1) return; // Already reading
        setAnalysisStatus('analyzing');
        reader.onload = (e) => {
            const wb = XLSX.read(e.target?.result, { type: 'binary' });
            const wsname = wb.SheetNames[0];
            const ws = wb.Sheets[wsname];
            const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (data.length > 0) {
                // --- Smart Header Detection ---
                let bestHeaderRowIndex = 0;
                let maxMatches = 0;

                // Scan first 20 rows to find the one that looks most like a header
                for (let i = 0; i < Math.min(data.length, 20); i++) {
                    const row = data[i];
                    if (!Array.isArray(row)) continue;

                    let matches = 0;
                    const rowStr = row.map(cell => String(cell || '').toLowerCase()).join(' ');

                    REQUIRED_FIELDS.forEach(field => {
                        if (field.key === 'studentId' && (rowStr.includes('รหัส') || rowStr.includes('id')) && !rowStr.includes('โรงเรียน') && !rowStr.includes('school')) matches++;
                        if (field.key === 'idCardNumber' && (rowStr.includes('บัตร') || rowStr.includes('citizen'))) matches++;
                        if (field.key === 'firstName' && rowStr.includes('ชื่อ')) matches++;
                        if (field.key === 'lastName' && rowStr.includes('สกุล')) matches++;
                    });

                    if (matches > maxMatches) {
                        maxMatches = matches;
                        bestHeaderRowIndex = i;
                    }
                }

                const headerRowIndex = maxMatches >= 2 ? bestHeaderRowIndex : 0;
                const rawHeaders = data[headerRowIndex] as any[];
                const headers = rawHeaders.map(h => String(h || '').trim()); // 💡 แก้ไข: ห้าม filter คอลัมน์ว่างออก เพื่อให้ Index ตรงกับข้อมูลจริง

                setExcelHeaders(headers);
                setExcelData(data.slice(headerRowIndex + 1));

                // Smart Auto-Map
                const newMapping: Record<string, string> = {};
                let missingCount = 0;

                REQUIRED_FIELDS.forEach(field => {
                    const match = headers.find(h => {
                        const hLower = h.toLowerCase().trim();
                        // Exact matches based on user provided DMC headers
                        if (field.key === 'idCardNumber' && h === 'เลขประจำตัวประชาชน') return true;
                        if (field.key === 'classLevel' && h === 'ชั้น') return true;
                        if (field.key === 'room' && h === 'ห้อง') return true;
                        if (field.key === 'studentId' && h === 'รหัสนักเรียน') return true;
                        if (field.key === 'gender' && h === 'เพศ') return true;
                        if (field.key === 'title' && h === 'คำนำหน้าชื่อ') return true;
                        if (field.key === 'firstName' && h === 'ชื่อ') return true;
                        if (field.key === 'lastName' && h === 'นามสกุล') return true;
                        if (field.key === 'firstNameEn' && h === 'ชื่อ (อังกฤษ)') return true;
                        if (field.key === 'lastNameEn' && h === 'นามสกุล (อังกฤษ)') return true;
                        if (field.key === 'birthDate' && h === 'วันเกิด') return true;
                        if (field.key === 'ageYear' && h === 'อายุ(ปี)') return true;
                        if (field.key === 'ageMonth' && h === 'อายุ(เดือน)') return true;
                        if (field.key === 'bloodType' && h === 'หมู่โลหิต') return true;
                        if (field.key === 'nationality' && h === 'สัญชาติ') return true;
                        if (field.key === 'race' && h === 'เชื้อชาติ') return true;
                        if (field.key === 'religion' && h === 'ศาสนา') return true;
                        if (field.key === 'elderBrotherCount' && h === 'จำนวนพี่ชาย') return true;
                        if (field.key === 'youngerBrotherCount' && h === 'จำนวนน้องชาย') return true;
                        if (field.key === 'elderSisterCount' && h === 'จำนวนพี่สาว') return true;
                        if (field.key === 'youngerSisterCount' && h === 'จำนวนน้องสาว') return true;
                        if (field.key === 'childOrder' && h === 'เป็นบุตรคนที่') return true;
                        if (field.key === 'parentsMaritalStatus' && h === 'สถานภาพสมรสของบิดามารดา') return true;

                        // Father
                        if (field.key === 'fatherIdNumber' && (h === 'หมายเลขบัตรประชาชนบิดา' || h === 'เลขบัตรประชาชนบิดา')) return true;
                        if (field.key === 'fatherTitle' && (h === 'คำนำหน้าชื่อบิดา' || h === 'คำนำหน้าบิดา')) return true;
                        if (field.key === 'fatherFirstName' && (h === 'ชื่อบิดา')) return true;
                        if (field.key === 'fatherLastName' && (h === 'นามสกุลบิดา')) return true;
                        if (field.key === 'fatherMonthlyIncome' && (h === 'รายได้ต่อเดือนของบิดา' || h === 'รายได้บิดา')) return true;
                        if (field.key === 'fatherPhone' && (h === 'หมายเลขโทรศัพท์ของบิดา' || h === 'เบอร์โทรบิดา')) return true;
                        if (field.key === 'fatherOccupation' && h === 'อาชีพบิดา') return true;

                        // Mother
                        if (field.key === 'motherIdNumber' && (h === 'หมายเลขบัตรประชาชนมารดา' || h === 'เลขบัตรประชาชนมารดา')) return true;
                        if (field.key === 'motherTitle' && (h === 'คำนำหน้าชื่อมารดา' || h === 'คำนำหน้ามารดา')) return true;
                        if (field.key === 'motherFirstName' && (h === 'ชื่อมารดา')) return true;
                        if (field.key === 'motherLastName' && (h === 'นามสกุลมารดา')) return true;
                        if (field.key === 'motherMonthlyIncome' && (h === 'รายได้ต่อเดือนของมารดา' || h === 'รายได้มารดา')) return true;
                        if (field.key === 'motherPhone' && (h === 'หมายเลขโทรศัพท์ของมารดา' || h === 'เบอร์โทรมารดา')) return true;
                        if (field.key === 'motherOccupation' && h === 'อาชีพมารดา') return true;

                        // Guardian
                        if (field.key === 'guardianRelationship' && (h === 'ความเกี่ยวข้องของผู้ปกครองกับนักเรียน' || h === 'ความสัมพันธ์ผู้ปกครอง')) return true;
                        if (field.key === 'guardianIdNumber' && (h === 'หมายเลขบัตรประชาชนผู้ปกครอง' || h === 'เลขบัตรประชาชนผู้ปกครอง')) return true;
                        if (field.key === 'guardianTitle' && (h === 'คำนำหน้าชื่อผู้ปกครอง' || h === 'คำนำหน้าผู้ปกครอง')) return true;
                        if (field.key === 'guardianFirstName' && (h === 'ชื่อผู้ปกครอง')) return true;
                        if (field.key === 'guardianLastName' && (h === 'นามสกุลผู้ปกครอง')) return true;
                        if (field.key === 'guardianMonthlyIncome' && (h === 'รายได้ต่อเดือนของผู้ปกครอง' || h === 'รายได้ผู้ปกครอง')) return true;
                        if (field.key === 'guardianPhone' && (h === 'หมายเลขโทรศัพท์ของผู้ปกครอง' || h === 'เบอร์โทรผู้ปกครอง')) return true;
                        if (field.key === 'guardianOccupation' && h === 'อาชีพผู้ปกครอง') return true;

                        // Address (Reg)
                        if (field.key === 'regHouseId' && h === 'รหัสประจำบ้าน (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regAddressNumber' && h === 'เลขที่บ้าน (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regMoo' && h === 'หมู่ (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regRoad' && h === 'ถนน (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regSubDistrict' && h === 'ตำบล (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regDistrict' && h === 'อำเภอ (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regProvince' && h === 'จังหวัด (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regZipCode' && h === 'รหัสไปรษณีย์ (ทะเบียนบ้าน)') return true;
                        if (field.key === 'regPhone' && h === 'หมายเลขโทรศัพท์ (ทะเบียนบ้าน)') return true;

                        // Address (Cur)
                        if (field.key === 'curHouseId' && h === 'รหัสประจำบ้าน (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curAddressNumber' && h === 'เลขที่บ้าน (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curMoo' && h === 'หมู่ (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curRoad' && h === 'ถนน (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curSubDistrict' && h === 'ตำบล (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curDistrict' && h === 'อำเภอ (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curProvince' && h === 'จังหวัด (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curZipCode' && h === 'รหัสไปรษณีย์ (ที่อยู่ปัจจุบัน)') return true;
                        if (field.key === 'curPhone' && h === 'หมายเลขโทรศัพท์ (ที่อยู่ปัจจุบัน)') return true;

                        // Health / Welfare
                        if (field.key === 'weight' && h === 'น้ำหนัก') return true;
                        if (field.key === 'height' && h === 'ส่วนสูง') return true;
                        if (field.key === 'disadvantageType' && h === 'ความด้อยโอกาส') return true;
                        if (field.key === 'staysAtSchool' && h === 'การพักนอนประจำ') return true;
                        if (field.key === 'lacksUniform' && h === 'ขาดแคลนเครื่องแบบ') return true;
                        if (field.key === 'lacksStationery' && h === 'ขาดแคลนเครื่องเขียน') return true;
                        if (field.key === 'lacksTextbook' && h === 'ขาดแคลนแบบเรียน') return true;
                        if (field.key === 'lacksLunch' && h === 'ขาดแคลนอาหารกลางวัน') return true;
                        if (field.key === 'disabilityType' && h === 'ความพิการ') return true;

                        // Travel / Academic
                        if (field.key === 'distanceDirtRoad' && h === 'ระยะทางจากบ้านถึงโรงเรียน (ถนนลูกรัง)') return true;
                        if (field.key === 'distancePavedRoad' && h === 'ระยะทางจากบ้านถึงโรงเรียน (ถนนลาดยาง)') return true;
                        if (field.key === 'distanceWaterway' && h === 'ระยะทางจากบ้านถึงโรงเรียน (ทางน้ำ)') return true;
                        if (field.key === 'travelTime' && h === 'ระยะเวลาจากบ้านถึงโรงเรียน') return true;
                        if (field.key === 'travelMethod' && h === 'ลักษณะการเดินทางมาโรงเรียน') return true;
                        if (field.key === 'studentType' && h === 'ประเภทนักเรียน') return true;
                        if (field.key === 'gpa' && h === 'GPA') return true;
                        if (field.key === 'gpax' && h === 'GPAX') return true;
                        if (field.key === 'birthProvince' && h === 'จังหวัดที่เกิด') return true;

                        // DMC Extras
                        if (field.key === 'childOrderInCategory' && h === 'เป็นบุตร/ธิดาลำดับที่') return true;
                        if (field.key === 'studyingSiblingCount' && h === 'จำนวนพี่น้องที่ศึกษาอยู่') return true;
                        if (field.key === 'elderBrotherCount1' && h === 'จำนวนพี่ชาย.1') return true;
                        if (field.key === 'youngerBrotherCount1' && h === 'จำนวนน้องชาย.1') return true;
                        if (field.key === 'youngerBrotherCount2' && h === 'จำนวนน้องชาย.2') return true;
                        if (field.key === 'youngerSisterCount1' && h === 'จำนวนน้องสาว.1') return true;
                        if (field.key === 'subSchoolId' && h === 'รหัสโรงเรียนห้องสาขา') return true;
                        if (field.key === 'subSchoolName' && h === 'ชื่อโรงเรียนห้องสาขา') return true;

                        // Fallback / Robust matching for generic files (keep some old logic but prioritized after exact matches)
                        if (field.key === 'studentId' && (h.includes('รหัส') || h.includes('id')) && !h.includes('โรงเรียน') && !h.includes('school') && !h.includes('บัตร') && !h.includes('บ้าน') && !h.includes('ไปรษณีย์')) return true;
                        if (field.key === 'idCardNumber' && (h.includes('บัตร') || h.includes('citizen') || h.includes('ปชช')) && !h.includes('บิดา') && !h.includes('มารดา') && !h.includes('ผู้ปกครอง')) return true;
                        if (field.key === 'title' && (h === 'คำนำหน้าชื่อ' || h === 'คำนำหน้า')) return true;
                        if (field.key === 'firstName' && (h === 'ชื่อ')) return true;
                        if (field.key === 'lastName' && (h === 'นามสกุล')) return true;
                        if (field.key === 'gender' && (h === 'เพศ')) return true;
                        if (field.key === 'birthDate' && (h === 'วันเกิด')) return true;

                        // Other fields
                        if (field.key === 'classLevel' && h === 'ชั้น') return true;
                        if (field.key === 'room' && h === 'ห้อง') return true;
                        if (field.key === 'studentNumber' && (h.includes('เลขที่') && !h.includes('บ้าน'))) return true; // Avoid address numbers

                        // Family (Robust)
                        if (field.key === 'fatherTitle' && (h.includes('คำนำหน้า') && h.includes('บิดา'))) return true;
                        if (field.key === 'fatherFirstName' && (h.includes('ชื่อบิดา') && !h.includes('คำนำหน้า'))) return true;
                        if (field.key === 'fatherLastName' && (h.includes('นามสกุลบิดา'))) return true;
                        if (field.key === 'motherTitle' && (h.includes('คำนำหน้า') && h.includes('มารดา'))) return true;
                        if (field.key === 'motherFirstName' && (h.includes('ชื่อมารดา') && !h.includes('คำนำหน้า'))) return true;
                        if (field.key === 'motherLastName' && (h.includes('นามสกุลมารดา'))) return true;
                        if (field.key === 'guardianTitle' && (h.includes('คำนำหน้า') && h.includes('ผู้ปกครอง'))) return true;
                        if (field.key === 'guardianFirstName' && (h === 'ชื่อผู้ปกครอง' || (h.includes('ชื่อผู้ปกครอง') && !h.includes('คำนำหน้า')))) return true;
                        if (field.key === 'guardianLastName' && (h === 'นามสกุลผู้ปกครอง' || h.includes('นามสกุลผู้ปกครอง'))) return true;
                        if (field.key === 'guardianPhone' && (h.includes('โทรศัพท์ของผู้ปกครอง') || h.includes('เบอร์โทรศัพท์ของผู้ปกครอง') || h.includes('หมายเลขโทรศัพท์ของผู้ปกครอง'))) return true;

                        // Address
                        if (field.key === 'regAddressNumber' && (h.includes('บ้านเลขที่') || h.includes('ที่อยู่'))) return true;
                        if (field.key === 'regMoo' && h.includes('หมู่')) return true;
                        if (field.key === 'regSubDistrict' && (h.includes('ตำบล') || h.includes('แขวง'))) return true;
                        if (field.key === 'regDistrict' && (h.includes('อำเภอ') || h.includes('เขต'))) return true;
                        if (field.key === 'regProvince' && h.includes('จังหวัด')) return true;
                        if (field.key === 'regZipCode' && h.includes('ไปรษณีย์')) return true;

                        // Health
                        if (field.key === 'weight' && h.includes('น้ำหนัก')) return true;
                        if (field.key === 'height' && h.includes('ส่วนสูง')) return true;

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

    // 2. Generate Preview
    const generatePreview = (mapping: Record<string, string>, rawData: any[], headers: string[]) => {
        try {
            const mapped: MappedData[] = rawData.map((row: any) => {
                const rowData: any = {};
                Object.entries(mapping).forEach(([key, header]) => {
                    const colIndex = headers.indexOf(header);
                    if (colIndex !== -1 && row[colIndex] !== undefined) {
                        rowData[key] = String(row[colIndex]).trim();
                    } else {
                        rowData[key] = "";
                    }
                });

                // --- DATA CLEANING & NORMALIZATION ---

                // 1. Clean ID Card (Digits only, max 13 chars)
                if (rowData.idCardNumber) {
                    rowData.idCardNumber = rowData.idCardNumber.replace(/[^0-9]/g, "").slice(0, 13);
                }


                // 3. Name Normalization Helper
                const commonTitles = ["นาย", "นาง", "นางสาว", "ด.ช.", "ด.ญ.", "น.ส."];
                const cleanName = (titleKey: string, firstKey: string) => {
                    let t = (rowData[titleKey] || "").trim();
                    let f = (rowData[firstKey] || "").trim();

                    if (f) {
                        // เช็คถ้าชื่อจริงเริ่มต้นด้วยคำนำหน้าที่มีอยู่แล้ว (เพื่อป้องกัน นายนาย)
                        const startsWithTitle = commonTitles.some(titlePrefix => f.startsWith(titlePrefix)) ||
                            (t && f.startsWith(t));

                        if (startsWithTitle) {
                            // ถ้าชื่อมีคำนำหน้าติดมาด้วยแล้ว ให้พยายามแยกคำนำหน้าออกมาใส่ title ถ้า title เดิมว่าง
                            if (!t) {
                                for (const prefix of commonTitles) {
                                    if (f.startsWith(prefix)) {
                                        t = prefix;
                                        f = f.replace(prefix, "").trim();
                                        break;
                                    }
                                }
                            } else if (f.startsWith(t)) {
                                // ถ้า title มีอยู่แล้ว และชื่อเริ่มต้นด้วย title นั้น ให้ตัดออกจากชื่อ
                                f = f.replace(t, "").trim();
                            }
                        }
                    }
                    rowData[titleKey] = t;
                    rowData[firstKey] = f;
                };

                // Normalize all names
                cleanName('title', 'firstName');
                cleanName('fatherTitle', 'fatherFirstName');
                cleanName('motherTitle', 'motherFirstName');
                cleanName('guardianTitle', 'guardianFirstName');

                // 2. Boolean normalization for welfare fields
                const toBool = (val: string) => val === 'ใช่' || val === 'จริง' || val === '1';

                return {
                    studentId: (rowData.studentId && rowData.studentId.length === 4) ? `0${rowData.studentId}` : (rowData.studentId || ""),
                    idCardNumber: rowData.idCardNumber || "",
                    title: rowData.title || "",
                    firstName: rowData.firstName || "",
                    lastName: rowData.lastName || "",
                    firstNameEn: rowData.firstNameEn || "",
                    lastNameEn: rowData.lastNameEn || "",
                    nickname: rowData.nickname || "",
                    classLevel: rowData.classLevel || "",
                    room: rowData.room || "",
                    studentNumber: rowData.studentNumber || "",
                    gender: rowData.gender || "",
                    birthDate: rowData.birthDate || "",
                    ageYear: rowData.ageYear || "",
                    ageMonth: rowData.ageMonth || "",
                    bloodType: rowData.bloodType || "",
                    nationality: rowData.nationality || "ไทย",
                    race: rowData.race || "ไทย",
                    religion: rowData.religion || "พุทธ",
                    birthProvince: rowData.birthProvince || "",

                    // Family
                    elderBrotherCount: rowData.elderBrotherCount || "0",
                    youngerBrotherCount: rowData.youngerBrotherCount || "0",
                    elderSisterCount: rowData.elderSisterCount || "0",
                    youngerSisterCount: rowData.youngerSisterCount || "0",
                    childOrder: rowData.childOrder || "1",
                    childOrderInCategory: rowData.childOrderInCategory || "1",
                    studyingSiblingCount: rowData.studyingSiblingCount || "0",
                    parentsMaritalStatus: rowData.parentsMaritalStatus || "อยู่ด้วยกัน",

                    // Father
                    fatherIdNumber: rowData.fatherIdNumber || "",
                    fatherTitle: rowData.fatherTitle || "",
                    fatherFirstName: rowData.fatherFirstName || "",
                    fatherLastName: rowData.fatherLastName || "",
                    fatherOccupation: rowData.fatherOccupation || "",
                    fatherMonthlyIncome: rowData.fatherMonthlyIncome || "0",
                    fatherPhone: rowData.fatherPhone || "",

                    // Mother
                    motherIdNumber: rowData.motherIdNumber || "",
                    motherTitle: rowData.motherTitle || "",
                    motherFirstName: rowData.motherFirstName || "",
                    motherLastName: rowData.motherLastName || "",
                    motherOccupation: rowData.motherOccupation || "",
                    motherMonthlyIncome: rowData.motherMonthlyIncome || "0",
                    motherPhone: rowData.motherPhone || "",

                    // Guardian
                    guardianRelationship: rowData.guardianRelationship || "",
                    guardianIdNumber: rowData.guardianIdNumber || "",
                    guardianTitle: rowData.guardianTitle || "",
                    guardianFirstName: rowData.guardianFirstName || "",
                    guardianLastName: rowData.guardianLastName || "",
                    guardianOccupation: rowData.guardianOccupation || "",
                    guardianMonthlyIncome: rowData.guardianMonthlyIncome || "0",
                    guardianPhone: rowData.guardianPhone || "",

                    // Address (Reg)
                    regHouseId: rowData.regHouseId || "",
                    regAddressNumber: rowData.regAddressNumber || "",
                    regMoo: rowData.regMoo || "",
                    regRoad: rowData.regRoad || "",
                    regSubDistrict: rowData.regSubDistrict || "",
                    regDistrict: rowData.regDistrict || "",
                    regProvince: rowData.regProvince || "",
                    regZipCode: rowData.regZipCode || "",
                    regPhone: rowData.regPhone || "",

                    // Address (Cur)
                    curHouseId: rowData.curHouseId || "",
                    curAddressNumber: rowData.curAddressNumber || "",
                    curMoo: rowData.curMoo || "",
                    curRoad: rowData.curRoad || "",
                    curSubDistrict: rowData.curSubDistrict || "",
                    curDistrict: rowData.curDistrict || "",
                    curProvince: rowData.curProvince || "",
                    curZipCode: rowData.curZipCode || "",
                    curPhone: rowData.curPhone || "",

                    // Health / Welfare
                    weight: rowData.weight || "",
                    height: rowData.height || "",
                    disadvantageType: rowData.disadvantageType || "ไม่มี",
                    staysAtSchool: rowData.staysAtSchool || "ไม่พักนอน",
                    lacksUniform: toBool(rowData.lacksUniform),
                    lacksStationery: toBool(rowData.lacksStationery),
                    lacksTextbook: toBool(rowData.lacksTextbook),
                    lacksLunch: toBool(rowData.lacksLunch),
                    disabilityType: rowData.disabilityType || "ปกติ",

                    // Travel / Academic
                    distanceDirtRoad: rowData.distanceDirtRoad || "0",
                    distancePavedRoad: rowData.distancePavedRoad || "0",
                    distanceWaterway: rowData.distanceWaterway || "0",
                    travelTime: rowData.travelTime || "",
                    travelMethod: rowData.travelMethod || "เดิน",
                    studentType: rowData.studentType || "ปกติ",
                    gpa: rowData.gpa || "",
                    gpax: rowData.gpax || "",

                    // DMC Extra
                    elderBrotherCount1: rowData.elderBrotherCount1 || "0",
                    youngerBrotherCount1: rowData.youngerBrotherCount1 || "0",
                    youngerBrotherCount2: rowData.youngerBrotherCount2 || "0",
                    youngerSisterCount1: rowData.youngerSisterCount1 || "0",
                    subSchoolId: rowData.subSchoolId || "",
                    subSchoolName: rowData.subSchoolName || "",

                    status: 'ready' as const
                };
            }).filter(item => item.studentId && item.firstName);

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


    // 3. Auto-Generate Student Numbers
    const handleAutoGenerateStudentNumbers = (sortType: 'name' | 'id') => {
        if (previewData.length === 0) return;

        const newData = [...previewData];
        // Group students by class and room
        const groups: Record<string, MappedData[]> = {};
        newData.forEach(s => {
            const key = `${s.classLevel}|${s.room}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(s);
        });

        // Loop through each group, sort and assign numbers
        Object.values(groups).forEach(group => {
            group.sort((a, b) => {
                if (sortType === 'name') {
                    // Sort by Thai Name (firstName then lastName)
                    return a.firstName.localeCompare(b.firstName, 'th') ||
                        a.lastName.localeCompare(b.lastName, 'th');
                } else {
                    // Sort by Student ID numerically
                    return a.studentId.localeCompare(b.studentId, undefined, { numeric: true, sensitivity: 'base' });
                }
            });

            // Re-assign student numbers starting from 1
            group.forEach((student, index) => {
                student.studentNumber = String(index + 1);
            });
        });

        setPreviewData(newData);
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: `จัดลำดับเลขที่เรียบร้อย (${sortType === 'name' ? 'เรียงชื่อ ก-ฮ' : 'เรียงรหัส'})`,
            showConfirmButton: false,
            timer: 3000
        });
    };

    // 4. Save to Firebase
    const handleSave = async () => {
        if (!schoolId) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่พบข้อมูลโรงเรียน',
                text: 'URL ไม่ถูกต้อง หรือคุณไม่ได้เลือกโรงเรียน',
            });
            return;
        }

        // --- Prepare for Saving ---
        setIsProcessing(true);
        setProgress(0);
        let successCount = 0;
        let skipCount = 0;
        let failCount = 0;

        const studentsRef = collection(firestore, 'school-settings', schoolId, 'students');
        const total = previewData.length;

        // --- Setup Unique & Premium Progress Overlay ---
        Swal.fire({
            html: `
                <style>
                    @keyframes pulse-soft {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.8; transform: scale(0.98); }
                    }
                    @keyframes shimmer {
                        0% { transform: translateX(-100%) skewX(-15deg); }
                        100% { transform: translateX(250%) skewX(-15deg); }
                    }
                    .animate-shimmer { animation: shimmer 2.5s infinite linear; }
                </style>
                <div class="px-2 py-4">
                    <!-- Header -->
                    <div class="flex flex-col items-center mb-8 pt-4">
                        <h3 class="text-2xl font-black text-gray-800 dark:text-white tracking-tight">กำลังประมวลผลข้อมูล</h3>
                        <div class="flex items-center gap-2 mt-2">
                            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                            <p class="text-[10px] text-gray-400 font-extrabold uppercase tracking-[0.2em]">ระบบประมวลผลข้อมูล DMC</p>
                        </div>
                    </div>

                    <!-- Main Progress -->
                    <div class="relative mb-10 px-2">
                        <div class="flex justify-between items-end mb-4">
                            <span id="swal-status-tag" class="text-[10px] font-black px-3 py-1.5 rounded-full bg-indigo-600 text-white uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none">กำลังทำงาน</span>
                            <div class="text-right">
                                <span id="swal-progress-text" class="text-5xl font-black text-indigo-600 dark:text-indigo-400 leading-none">0%</span>
                            </div>
                        </div>
                        <div class="w-full bg-gray-100 dark:bg-gray-800/80 rounded-3xl h-6 overflow-hidden p-1.5 border border-gray-200 dark:border-gray-700 shadow-inner">
                            <div id="swal-progress-bar" class="bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-500 h-full rounded-2xl transition-all duration-700 relative shadow-lg" style="width: 0%">
                                <div class="absolute inset-0 bg-white/20 w-1/2 h-full animate-shimmer"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Contextual Feedback (Student Name) -->
                    <div class="bg-gray-50 dark:bg-gray-900/50 rounded-[2rem] p-6 border border-gray-100 dark:border-gray-800 mb-8 relative overflow-hidden text-left">
                        <div class="absolute top-0 right-0 p-4 opacity-[0.03] dark:opacity-[0.05]">
                            <i class="fas fa-user-graduate text-6xl text-gray-900 dark:text-white"></i>
                        </div>
                        <span class="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase block mb-2 tracking-widest">กำลังดำเนินการสำหรับ</span>
                        <div id="swal-current-item" class="text-lg font-black text-gray-700 dark:text-gray-200 truncate">เตรียมฐานข้อมูล...</div>
                    </div>

                    <!-- Stats Dashboard -->
                    <div class="grid grid-cols-3 gap-4">
                        <div class="p-5 bg-white dark:bg-gray-800/30 rounded-3xl border border-gray-100 dark:border-gray-800 text-center shadow-sm">
                            <span class="text-[9px] font-bold text-gray-400 block mb-1 uppercase tracking-tighter">คิวงาน</span>
                            <span class="text-xl font-black text-gray-800 dark:text-white">${total}</span>
                        </div>
                        <div class="p-5 bg-emerald-50 dark:bg-emerald-950/20 rounded-3xl border border-emerald-100 dark:border-emerald-900/40 text-center shadow-sm">
                            <span class="text-[9px] font-bold text-emerald-500 block mb-1 uppercase tracking-tighter">สำเร็จ</span>
                            <span id="swal-success-count" class="text-xl font-black text-emerald-600 dark:text-emerald-400">0</span>
                        </div>
                        <div class="p-5 bg-amber-50 dark:bg-amber-950/20 rounded-3xl border border-amber-100 dark:border-amber-900/40 text-center shadow-sm">
                            <span class="text-[9px] font-bold text-amber-500 block mb-1 uppercase tracking-tighter">ข้าม (ซ้ำ)</span>
                            <span id="swal-skip-count" class="text-xl font-black text-amber-600 dark:text-amber-400">0</span>
                        </div>
                    </div>
                </div>
            `,
            allowOutsideClick: false,
            allowEscapeKey: false,
            showConfirmButton: false,
            width: '32rem',
            padding: '1.5rem',
            customClass: {
                popup: 'rounded-[3rem] dark:bg-[#1e1f21] dark:border dark:border-gray-800 shadow-2xl',
            }
        });

        // --- Process Loop ---
        const duplicates: { record: MappedData; conflict: any }[] = [];

        for (let i = 0; i < total; i++) {
            const student = previewData[i];

            // Update UI with student name (Real-time Feedback)
            const currentItemEl = document.getElementById('swal-current-item');
            if (currentItemEl) {
                currentItemEl.innerText = `${student.firstName} ${student.lastName}`;
            }

            try {
                // Check Duplicate (By studentId or idCardNumber)
                let conflictDoc: any = null;

                // Check Student ID
                if (student.studentId) {
                    const qId = query(studentsRef, where('studentId', '==', student.studentId));
                    const snapshotId = await getDocs(qId);
                    if (!snapshotId.empty) {
                        conflictDoc = snapshotId.docs[0].data();
                    }
                }

                // Check ID Card Number (if not already found)
                if (!conflictDoc && student.idCardNumber) {
                    const qCard = query(studentsRef, where('idCardNumber', '==', student.idCardNumber));
                    const snapshotCard = await getDocs(qCard);
                    if (!snapshotCard.empty) {
                        conflictDoc = snapshotCard.docs[0].data();
                    }
                }

                if (conflictDoc) {
                    duplicates.push({ record: student, conflict: conflictDoc });
                    skipCount++;
                    const skipCountEl = document.getElementById('swal-skip-count');
                    if (skipCountEl) skipCountEl.innerText = String(skipCount);
                } else {
                    const { status, ...allStudentData } = student;

                    const roles = ["student"];
                    if (allStudentData.fatherPhone || allStudentData.motherPhone || allStudentData.guardianPhone) {
                        roles.push("parent");
                    }

                    const studentData: any = {
                        ...allStudentData,
                        schoolId: schoolId,
                        role: roles,
                        studentStatus: 'เรียนอยู่',
                        profileImageUrl: "",
                        behaviorScore: 100,
                        createdAt: serverTimestamp(),
                    };

                    await addDoc(studentsRef, studentData);
                    successCount++;
                    const successCountEl = document.getElementById('swal-success-count');
                    if (successCountEl) successCountEl.innerText = String(successCount);
                }
            } catch (error) {
                console.error(`Failed to process student ${student.studentId}`, error);
                failCount++;
            }

            // Update Progress Percentage & Bar
            const currentProgress = Math.round(((i + 1) / total) * 100);
            setProgress(currentProgress);

            const progressBar = document.getElementById('swal-progress-bar');
            const progressText = document.getElementById('swal-progress-text');
            if (progressBar) progressBar.style.width = `${currentProgress}%`;
            if (progressText) progressText.innerText = `${currentProgress}%`;
        }

        setIsProcessing(false);
        Swal.close();

        // --- Final Summary Popup (Premium Dashboard Style) ---
        Swal.fire({
            html: `
                <div class="px-2 py-8">
                    <div class="flex flex-col items-center mb-10 pt-4">
                        <h3 class="text-4xl font-black text-gray-800 dark:text-white tracking-tight">นำเข้าสำเร็จ!</h3>
                        <p class="text-xs text-gray-400 font-extrabold uppercase tracking-[0.3em] mt-3">ดำเนินการเรียบร้อยแล้ว</p>
                    </div>

                    <div class="space-y-4 mb-12">
                        <div class="flex justify-between items-center p-6 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-[2.5rem] border border-emerald-100 dark:border-emerald-800/30 hover:scale-[1.02] transition-transform duration-500 group">
                            <div class="flex items-center gap-5">
                                <div class="w-14 h-14 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:rotate-6 transition-transform">
                                    <i class="fas fa-plus-circle text-2xl text-emerald-500"></i>
                                </div>
                                <div class="text-left">
                                    <span class="text-xs font-bold text-emerald-600/60 dark:text-emerald-400/60 uppercase block tracking-wider">บันทึกใหม่</span>
                                    <span class="text-lg font-black text-gray-700 dark:text-gray-200">บันทึกใหม่</span>
                                </div>
                            </div>
                            <span class="text-4xl font-black text-emerald-600 dark:text-emerald-400">${successCount}</span>
                        </div>
                        
                        <div class="flex justify-between items-center p-6 bg-amber-50/50 dark:bg-amber-900/10 rounded-[2.5rem] border border-amber-100 dark:border-amber-800/30 hover:scale-[1.02] transition-transform duration-500 group">
                            <div class="flex items-center gap-5">
                                <div class="w-14 h-14 bg-white dark:bg-gray-800 rounded-2xl flex items-center justify-center shadow-sm group-hover:rotate-6 transition-transform">
                                    <i class="fas fa-copy text-2xl text-amber-500"></i>
                                </div>
                                <div class="text-left">
                                    <span class="text-xs font-bold text-amber-600/60 dark:text-amber-400/60 uppercase block tracking-wider">ข้อมูลซ้ำ</span>
                                    <span class="text-lg font-black text-gray-700 dark:text-gray-200">ข้อมูลที่ซ้ำกัน</span>
                                </div>
                            </div>
                            <span class="text-4xl font-black text-amber-600 dark:text-amber-400">${skipCount}</span>
                        </div>

                        ${duplicates.length > 0 ? `
                            <div class="mt-8">
                                <div class="flex items-center gap-2 mb-3 px-4">
                                    <div class="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
                                    <h4 class="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">รายละเอียดข้อมูลที่ซ้ำ</h4>
                                </div>
                                <div class="max-h-64 overflow-y-auto rounded-[2rem] border border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-2 custom-scrollbar">
                                    <table class="w-full text-left border-separate border-spacing-y-2">
                                        <thead>
                                            <tr class="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">
                                                <th class="px-4 pb-2">นักเรียนใหม่</th>
                                                <th class="px-4 pb-2">ซ้ำกับคนปัจจุบัน</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${duplicates.map(d => `
                                                <tr class="bg-white dark:bg-gray-800/50 rounded-2xl shadow-sm">
                                                    <td class="p-4 rounded-l-2xl border-y border-l border-gray-50 dark:border-gray-800">
                                                        <div class="font-bold text-gray-700 dark:text-gray-200">${d.record.firstName} ${d.record.lastName}</div>
                                                        <div class="text-[10px] text-gray-400 font-medium mt-1">ID: ${d.record.studentId || "-"}</div>
                                                    </td>
                                                    <td class="p-4 rounded-r-2xl border-y border-r border-gray-50 dark:border-gray-800">
                                                        <div class="font-bold text-indigo-600 dark:text-indigo-400">${d.conflict.title || ""}${d.conflict.firstName} ${d.conflict.lastName}</div>
                                                        <div class="flex items-center gap-2 mt-1">
                                                            <span class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[9px] font-black rounded-lg uppercase tracking-tighter">ชั้น ${d.conflict.classLevel || d.conflict.level || ""}/${d.conflict.room || ""}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            `).join("")}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ` : ""}

                        ${failCount > 0 ? `
                        <div class="flex justify-between items-center p-6 bg-red-50/50 dark:bg-red-900/10 rounded-[2.5rem] border border-red-100 dark:border-red-800/30 group">
                            <i class="fas fa-exclamation-triangle text-2xl text-red-500"></i>
                            <div class="text-left flex-1 px-5">
                                <span class="text-xs font-bold text-red-600/60 uppercase block">ล้มเหลว</span>
                                <span class="text-lg font-black text-gray-700 dark:text-gray-200 text-left">ข้อผิดพลาด</span>
                            </div>
                            <span class="text-4xl font-black text-red-600">${failCount}</span>
                        </div>
                        ` : ''}
                    </div>

                    <button id="swal-confirm-custom" class="w-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 py-5 rounded-[2rem] text-sm font-black uppercase tracking-[0.2em] shadow-xl hover:scale-[0.98] transition-transform active:scale-95">
                        กลับสู่หน้ารายชื่อนักเรียน
                    </button>
                </div>
            `,
            showConfirmButton: false,
            width: '32rem',
            customClass: {
                popup: 'rounded-[4rem] dark:bg-[#1e1f21] dark:border dark:border-gray-800 shadow-3xl overflow-hidden',
            },
            didOpen: () => {
                const btn = document.getElementById('swal-confirm-custom');
                if (btn) btn.onclick = () => Swal.clickConfirm();
            }
        }).then(() => {
            navigate(`/school/${schoolId}/students`);
        });
    };


    // --- Render Helpers ---

    return (
        <MainLayout>
            <div className="p-4 sm:p-8 text-gray-900 dark:text-white transition-colors duration-300 flex-1 flex flex-col min-h-full bg-gray-50 dark:bg-[#1e1f21]">
                <div className="max-w-5xl mx-auto w-full flex-1 flex flex-col">
                    {/* Header Section */}
                    <header className="mb-10 animate-in fade-in slide-in-from-top-4 duration-700">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-indigo-600 rounded-lg text-white">
                                <FaTable className="text-xl" />
                            </div>
                            <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
                                นำเข้าข้อมูลนักเรียน
                            </h1>
                        </div>
                        <p className="text-gray-500 dark:text-gray-400 font-medium pb-2 border-b border-gray-200 dark:border-gray-800">
                            นำเข้าข้อมูลจากไฟล์ DMC (Excel) เข้าสู่ระบบบริหารจัดการนักเรียนโดยอัตโนมัติ
                        </p>
                    </header>

                    {/* Top Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        {/* 1. Upload Section */}
                        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
                            <div className="flex items-center justify-between mb-5 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <FaCloudUploadAlt className="text-indigo-500" /> อัปโหลดไฟล์
                                </h2>
                                {file && (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded">Selected</span>
                                )}
                            </div>

                            <div
                                className={`
                                    flex-1 relative border-2 border-dashed rounded-2xl p-6 text-center transition-all duration-300 flex flex-col items-center justify-center min-h-[220px]
                                    ${file
                                        ? 'bg-indigo-50/30 dark:bg-indigo-500/5 border-indigo-200 dark:border-indigo-500/30'
                                        : 'bg-gray-50/50 dark:bg-[#1e1f21]/50 border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 cursor-pointer group'
                                    }
                                `}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={handleDrop}
                                onClick={() => !file && fileInputRef.current?.click()}
                            >
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".xlsx, .xls"
                                    onChange={handleFileSelect}
                                />

                                {file ? (
                                    <div className="animate-in fade-in zoom-in duration-500 w-full">
                                        <div className="w-16 h-16 bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm border border-indigo-100 dark:border-indigo-900/30">
                                            <FaFileExcel className="text-3xl" />
                                        </div>
                                        <h3 className="text-base font-bold truncate max-w-[250px] mx-auto text-gray-900 dark:text-white px-2 mb-1">{file.name}</h3>
                                        <p className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">{(file.size / 1024).toFixed(1)} KB • XLSX</p>

                                        <button
                                            onClick={(e) => { e.stopPropagation(); setFile(null); setAnalysisStatus('idle'); }}
                                            className="mt-6 px-5 py-2 bg-white dark:bg-gray-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-xs font-bold transition-all border border-red-100 dark:border-red-900/50 shadow-sm"
                                        >
                                            เปลี่ยนไฟล์
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
                                        <div className="w-20 h-20 bg-white dark:bg-[#2a2b2f] text-indigo-500 rounded-3xl flex items-center justify-center mx-auto shadow-indigo-100 dark:shadow-none shadow-xl group-hover:scale-110 transition-transform duration-500 border border-gray-50 dark:border-gray-800">
                                            <FaFileUpload className="text-3xl" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-lg text-gray-900 dark:text-white">เริ่มต้นนำเข้าข้อมูล</p>
                                            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">ลากไฟล์ Excel มาวางที่นี่ หรือคลิกเพื่อค้นหา</p>
                                        </div>
                                        <div className="flex justify-center gap-2 pt-2">
                                            <span className="px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-[10px] font-bold text-gray-400 border border-gray-100 dark:border-gray-700 shadow-sm">XLSX, XLS</span>
                                            <span className="px-3 py-1 bg-white dark:bg-gray-800 rounded-full text-[10px] font-bold text-gray-400 border border-gray-100 dark:border-gray-700 shadow-sm">MAX 20MB</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. Status Card */}
                        <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col">
                            <div className="flex items-center justify-between mb-5 border-b border-gray-100 dark:border-gray-800 pb-3">
                                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <FaMagic className="text-indigo-500" /> สถานะข้อมูล
                                </h2>
                                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${analysisStatus === 'complete' ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'text-gray-400 bg-gray-50 dark:bg-gray-500/10'}`}>
                                    {analysisStatus === 'idle' ? 'Ready' : analysisStatus}
                                </span>
                            </div>

                            <div className="flex-1 flex flex-col justify-center">
                                {analysisStatus === 'idle' ? (
                                    <div className="py-10 flex flex-col items-center justify-center text-center opacity-30">
                                        <div className="w-16 h-16 bg-gray-100 dark:bg-[#1e1f21] rounded-full flex items-center justify-center mb-4">
                                            <FaCheckCircle className="text-3xl text-gray-400" />
                                        </div>
                                        <p className="text-xs font-black uppercase tracking-widest text-gray-400">รอวิเคราะห์ไฟล์ข้อมูล</p>
                                    </div>
                                ) : analysisStatus === 'analyzing' ? (
                                    <div className="py-10 flex flex-col items-center justify-center space-y-5">
                                        <div className="relative">
                                            <div className="w-14 h-14 border-4 border-indigo-100 dark:border-indigo-900/20 rounded-full border-t-indigo-600 animate-spin"></div>
                                        </div>
                                        <p className="text-gray-500 dark:text-gray-400 font-bold animate-pulse text-sm">กำลังประมวลผลข้อมูลในไฟล์...</p>
                                    </div>
                                ) : analysisStatus === 'complete' ? (
                                    <div className="space-y-6 animate-in fade-in duration-500">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-4 bg-gray-50 dark:bg-[#1e1f21] rounded-2xl border border-gray-100 dark:border-gray-800">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase block mb-1 tracking-tight">จำนวนนักเรียน</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-3xl font-black text-gray-900 dark:text-white">{previewData.length}</span>
                                                    <span className="text-xs font-bold text-gray-400">คน</span>
                                                </div>
                                            </div>
                                            <div className="p-4 bg-gray-50 dark:bg-[#1e1f21] rounded-2xl border border-gray-100 dark:border-gray-800">
                                                <span className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase block mb-1 tracking-tight">ความพร้อม</span>
                                                <div className="flex items-center gap-1.5 text-emerald-500 dark:text-emerald-400">
                                                    <FaCheckCircle className="text-sm" />
                                                    <span className="text-xl font-black">100%</span>
                                                </div>
                                            </div>
                                        </div>

                                        {isProcessing ? (
                                            <div className="bg-gray-50 dark:bg-[#1e1f21] p-4 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-3">
                                                <div className="flex justify-between text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                                                    <span>บันทึกข้อมูล...</span>
                                                    <span>{progress}%</span>
                                                </div>
                                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                                                    <div
                                                        className="bg-indigo-600 h-full transition-all duration-300 shadow-sm"
                                                        style={{ width: `${progress}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={handleSave}
                                                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-3 active:scale-95"
                                            >
                                                <FaSave className="text-lg" /> ยืนยันและการนำเข้าข้อมูล
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="p-5 bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/20 rounded-2xl flex items-start gap-4">
                                        <div className="p-2 bg-amber-500 rounded-lg text-white">
                                            <FaExclamationTriangle />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-amber-900 dark:text-amber-400 text-sm">ตรวจพบบางส่วนไม่สมบูรณ์</h4>
                                            <p className="text-xs text-amber-700 dark:text-amber-500/80 mt-1 leading-relaxed">ข้อมูลบางคอลัมน์ไม่ตรงตามรูปแบบ DMC กรุณาตรวจสอบข้อมูลและการจับคู่ด้านล่าง</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Mapping Section (Conditional) */}
                    {analysisStatus === 'missing_fields' && (
                        <div className="bg-white dark:bg-[#2a2b2f] p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 animate-in fade-in slide-in-from-bottom-8 duration-500 mb-8">
                            <div className="mb-8 block">
                                <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-2">ระบุความสัมพันธ์ของข้อมูล</h2>
                                <p className="text-gray-500 dark:text-gray-400">กรุณาเลือกคอลัมน์จากไฟล์ Excel ให้ตรงกับช่องข้อมูลที่ระบบต้องการเพื่อความแม่นยำ</p>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-6">
                                {REQUIRED_FIELDS.map(field => (
                                    <div key={field.key} className="space-y-1.5">
                                        <label className="text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest pl-1">
                                            {field.label} {field.required && <span className="text-red-500">*</span>}
                                        </label>
                                        <select
                                            value={columnMapping[field.key] || ''}
                                            onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                                            className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 text-sm font-bold focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:focus:bg-[#2a2b2f] transition-all text-gray-900 dark:text-white appearance-none cursor-pointer"
                                        >
                                            <option value="">-- ไม่พบข้อมูล --</option>
                                            {excelHeaders.map(h => (
                                                <option key={h} value={h}>{h}</option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-10 pt-8 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                                <button
                                    onClick={() => generatePreview(columnMapping, excelData, excelHeaders)}
                                    className="px-10 py-3.5 bg-gray-950 dark:bg-white text-white dark:text-gray-950 rounded-2xl font-black shadow-xl hover:opacity-90 transition-all hover:scale-105 active:scale-95"
                                >
                                    เริ่มวิเคราะห์ข้อมูลใหม่
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Preview Section */}
                    {previewData.length > 0 && analysisStatus === 'complete' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-8 duration-700 flex-1 flex flex-col" ref={tableContainerRef}>
                            <div className="bg-white dark:bg-[#2a2b2f] rounded-3xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden flex flex-col flex-1">
                                {/* Filter & Header */}
                                <div className="p-6 sm:p-8 bg-white dark:bg-[#2a2b2f] border-b border-gray-100 dark:border-gray-800">
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                        <div>
                                            <h2 className="text-2xl font-black text-gray-900 dark:text-white">ตรวจสอบข้อมูล ({filteredData.length})</h2>
                                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium">กรองข้อมูลเพื่อตรวจสอบความถูกต้องก่อนบันทึก</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row items-center gap-4">
                                            <div className="flex bg-gray-50 dark:bg-[#1e1f21] p-1 rounded-xl border border-gray-200 dark:border-gray-700 h-[46px] items-center">
                                                <button
                                                    onClick={() => handleAutoGenerateStudentNumbers('name')}
                                                    className="px-3 h-full rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center gap-2 hover:bg-white dark:hover:bg-gray-800 transition-all text-gray-500 hover:text-indigo-600 active:scale-95"
                                                    title="เรียงเลขที่ตามชื่อ ก-ฮ"
                                                >
                                                    <FaMagic className="text-xs" /> ชื่อ
                                                </button>
                                                <div className="w-[1px] h-4 bg-gray-200 dark:bg-gray-700 mx-1"></div>
                                                <button
                                                    onClick={() => handleAutoGenerateStudentNumbers('id')}
                                                    className="px-3 h-full rounded-lg text-[10px] font-black uppercase tracking-tight flex items-center gap-2 hover:bg-white dark:hover:bg-gray-800 transition-all text-gray-500 hover:text-indigo-600 active:scale-95"
                                                    title="เรียงเลขที่ตามรหัสนักเรียน"
                                                >
                                                    <FaTable className="text-xs" /> รหัส
                                                </button>
                                            </div>

                                            <select
                                                value={selectedClassLevel}
                                                onChange={(e) => { setSelectedClassLevel(e.target.value); setSelectedRoom('all'); setCurrentPage(1); }}
                                                className="w-full sm:w-48 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs font-black focus:ring-2 focus:ring-indigo-500 transition-all text-gray-700 dark:text-gray-300 h-[46px]"
                                            >
                                                <option value="all">ทุกระดับชั้น</option>
                                                {availableLevels.map(level => (
                                                    <option key={level} value={level}>{level}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={selectedRoom}
                                                onChange={(e) => { setSelectedRoom(e.target.value); setCurrentPage(1); }}
                                                className="w-full sm:w-48 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2.5 text-xs font-black focus:ring-2 focus:ring-indigo-500 transition-all text-gray-700 dark:text-gray-300 disabled:opacity-50 h-[46px]"
                                                disabled={selectedClassLevel === 'all'}
                                            >
                                                <option value="all">ทุกห้องเรียน</option>
                                                {selectedClassLevel !== 'all' && Array.from(new Set(
                                                    previewData.filter(s => s.classLevel === selectedClassLevel).map(s => s.room)
                                                )).sort((a, b) => a.localeCompare(b, 'th')).map(room => (
                                                    <option key={room} value={room}>{room}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                {/* Desktop View: Table */}
                                <div className="hidden md:block table-responsive">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-gray-50 dark:bg-[#1e1f21] text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 dark:border-gray-800">
                                                <th className="px-8 py-5 text-center w-20">เลขที่</th>
                                                <th className="px-8 py-5">นักเรียน</th>
                                                <th className="px-8 py-5 text-center">ระดับชั้น / ห้อง</th>
                                                <th className="px-8 py-5">ผู้ปกครอง</th>
                                                <th className="px-8 py-5 text-right">สถานะ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800/50">
                                            {(() => {
                                                const start = (currentPage - 1) * itemsPerPage;
                                                return filteredData.slice(start, start + itemsPerPage).map((student, idx) => (
                                                    <tr key={idx} className="group hover:bg-gray-50/50 dark:hover:bg-indigo-500/5 transition-colors">
                                                        <td className="px-8 py-5 text-center">
                                                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 font-black text-xs border border-gray-200 dark:border-gray-700">
                                                                {student.studentNumber || '-'}
                                                            </span>
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/10 to-indigo-600/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-sm border border-indigo-100 dark:border-indigo-500/20">
                                                                    {student.firstName.charAt(0)}
                                                                </div>
                                                                <div>
                                                                    <div className="font-bold text-gray-900 dark:text-white leading-tight">
                                                                        {formatFullName(student.title, student.firstName, student.lastName)}
                                                                    </div>
                                                                    <div className="text-[10px] text-gray-400 font-mono mt-0.5">ID: {student.studentId}</div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5 text-center">
                                                            <div className="font-black text-indigo-600 dark:text-indigo-400">{student.classLevel}</div>
                                                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                                                                {`ห้อง ${student.room || '-'}`}
                                                            </div>
                                                        </td>
                                                        <td className="px-8 py-5">
                                                            <div className="font-semibold text-xs text-gray-800 dark:text-gray-300">
                                                                {formatFullName(student.guardianTitle, student.guardianFirstName, student.guardianLastName)}
                                                            </div>
                                                            <div className="text-[10px] text-gray-400 font-medium">{student.guardianPhone || 'ไม่ระบุ'}</div>
                                                        </td>
                                                        <td className="px-8 py-5 text-right">
                                                            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black rounded-lg uppercase tracking-wider border border-emerald-100 dark:border-emerald-500/20 shadow-sm">
                                                                <FaCheckCircle className="text-[10px]" /> Verified
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ));
                                            })()}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Mobile View: Cards */}
                                <div className="md:hidden p-4 space-y-4">
                                    {(() => {
                                        const start = (currentPage - 1) * itemsPerPage;
                                        return filteredData.slice(start, start + itemsPerPage).map((student, idx) => (
                                            <div key={idx} className="bg-gray-50/50 dark:bg-[#1e1f21]/50 p-5 rounded-2xl border border-gray-100 dark:border-gray-800 space-y-4 shadow-sm">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#2a2b2f] text-indigo-500 flex items-center justify-center font-black text-xs border border-gray-100 dark:border-gray-800 shadow-sm relative">
                                                            {student.firstName.charAt(0)}
                                                            {student.studentNumber && (
                                                                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-600 text-white rounded-md flex items-center justify-center text-[9px] font-black border-2 border-white dark:border-gray-900">
                                                                    {student.studentNumber}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-bold text-sm text-gray-900 dark:text-white leading-tight">
                                                                {student.title}{student.firstName} {student.lastName}
                                                            </h4>
                                                            <p className="text-[10px] text-gray-400 font-mono mt-0.5 uppercase tracking-wide">ID: {student.studentId}</p>
                                                        </div>
                                                    </div>
                                                    <span className="p-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 rounded-lg border border-emerald-100 dark:border-emerald-500/20">
                                                        <FaCheckCircle className="text-xs" />
                                                    </span>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                                                    <div>
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">ชั้นเรียน</span>
                                                        <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{student.classLevel} / {student.room || '-'}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-0.5">ผู้ปกครอง</span>
                                                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">
                                                            {formatFullName(student.guardianTitle, student.guardianFirstName, student.guardianLastName)}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ));
                                    })()}
                                </div>

                                {/* Pagination Footer */}
                                <div className="p-6 bg-gray-50 dark:bg-[#1e1f21] border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-6">
                                    <div className="text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                                        หน้า {currentPage} / {totalPages || 1} • พบนักเรียน {filteredData.length} คน
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            disabled={currentPage === 1}
                                            className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl disabled:opacity-20 hover:shadow-md transition-all active:scale-95 group"
                                        >
                                            <FaChevronRight className="rotate-180 text-gray-400 group-hover:text-indigo-500" />
                                        </button>

                                        <div className="flex items-center gap-1.5 table-responsive max-w-[200px] sm:max-w-none no-scrollbar">
                                            {getPageNumbers().map((n, i) => (
                                                n === '...' ? (
                                                    <span key={`dots-${i}`} className="w-8 text-center text-gray-400 font-bold">...</span>
                                                ) : (
                                                    <button
                                                        key={n}
                                                        onClick={() => setCurrentPage(n as number)}
                                                        className={`
                                                            min-w-[40px] h-10 flex items-center justify-center rounded-xl text-xs font-black transition-all
                                                            ${currentPage === n
                                                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                                                : 'bg-white dark:bg-[#2a2b2f] text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-200'
                                                            }
                                                        `}
                                                    >
                                                        {n}
                                                    </button>
                                                )
                                            ))}
                                        </div>

                                        <button
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            disabled={currentPage === totalPages || totalPages === 0}
                                            className="w-10 h-10 flex items-center justify-center bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl disabled:opacity-20 hover:shadow-md transition-all active:scale-95 group"
                                        >
                                            <FaChevronRight className="text-gray-400 group-hover:text-indigo-500" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Empty State */}
                    {!file && (
                        <div className="flex-1 flex flex-col items-center justify-center py-20 px-6 animate-in fade-in zoom-in duration-1000">
                            <div className="w-32 h-32 bg-white dark:bg-[#2a2b2f] rounded-[40px] flex items-center justify-center shadow-xl mb-10 relative group">
                                <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500/10 to-emerald-500/10 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                                <FaFileExcel className="text-6xl text-gray-200 dark:text-gray-700 relative z-10" />
                            </div>
                            <h3 className="text-2xl font-black text-gray-400 dark:text-gray-600">พร้อมประมวลผลข้อมูล</h3>
                            <p className="text-sm text-gray-400 dark:text-gray-500 mt-4 max-w-sm text-center font-medium leading-relaxed">
                                อัปโหลดไฟล์ DMC ของคุณเพื่อเริ่มกระบวนการจัดเก็บข้อมูลนักเรียนเข้าสู่ระบบโดยอัตโนมัติ สะดวก รวดเร็ว และแม่นยำ
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};


export default ImportStudentDMCPage;