import React, { useState, useEffect, useCallback, useRef } from "react";
import MainLayout from "@/layouts/MainLayout";
import BackButton from "@/components/Shared/BackButton";
import ProfileAvatar from "@/components/Shared/ProfileAvatar";
import { firestore } from "@/firebase";
import { collection, getDocs, query, orderBy, doc, getDoc } from "firebase/firestore";
import { FaSearch, FaFileAlt } from "react-icons/fa";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X, FileDown, Loader2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { isStudyingStudent } from "@/utils/studentStatusUtils";
import { pdf, PDFViewer } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import PorBor6ReportDocument from "@/components/Pdf/porbor6/PorBor6ReportDocument";
import { fetchPorBor6ReportData, computeClassLevelRanks, ClassLevelRankEntry, PorBor6ReportData } from "@/utils/porBor6Utils";
import { getThaiYear, getCurrentThaiYear } from "@/utils/dateUtils";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import { CLASSES } from "@/utils/schoolUtils";
import Select from 'react-select';
import Swal from 'sweetalert2';

const compactSelectStyles = {
    control: (base: any, state: any) => ({
        ...base,
        backgroundColor: 'var(--select-bg, #ffffff)',
        borderColor: state.isFocused ? '#6366f1' : 'var(--select-border, #e5e7eb)',
        boxShadow: state.isFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
        borderRadius: '0.75rem',
        padding: '2px 4px',
        fontSize: '14px',
        minHeight: '44px',
        '&:hover': { borderColor: '#6366f1' }
    }),
    menu: (base: any) => ({
        ...base,
        backgroundColor: 'var(--select-menu-bg, #ffffff)',
        borderRadius: '1rem',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        padding: '8px',
        border: '1px solid var(--select-border, #f3f4f6)',
        zIndex: 50
    }),
    option: (base: any, state: any) => ({
        ...base,
        backgroundColor: state.isSelected ? '#6366f1' : state.isFocused ? 'rgba(99, 102, 241, 0.1)' : 'transparent',
        color: state.isSelected ? '#ffffff' : 'var(--select-text, #1f2937)',
        borderRadius: '0.5rem',
        margin: '2px 0',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: state.isSelected ? '700' : '500',
    }),
    singleValue: (base: any) => ({ ...base, color: 'var(--select-text, #1f2937)', fontWeight: '600' }),
    menuList: (base: any) => ({ ...base, maxHeight: '400px', padding: '4px' }),
    placeholder: (base: any) => ({ ...base, color: '#9ca3af' }),
};

interface Student {
    id: string;
    profileImageUrl?: string;
    studentId: string;
    firstName: string;
    lastName: string;
    title: string;
    classLevel: string;
    room: string;
    studentStatus: string;
    classLevelKey?: string;
    seatNumber?: string;
}

const isSecondaryLevel = (classLevel?: string) => String(classLevel || '').trim().startsWith('ม');

const PorBor6Page: React.FC = () => {
    const { ACADEMIC_MANAGEMENT } = usePermissions();
    const [students, setStudents] = useState<Student[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [schoolId, setSchoolId] = useState<string | null>(null);
    const [schoolInfo, setSchoolInfo] = useState<any>(null);
    const [selectedClassLevel, setSelectedClassLevel] = useState('');
    const [selectedRoom, setSelectedRoom] = useState('');
    const [isExporting, setIsExporting] = useState<string | null>(null);
    const [pdfPreview, setPdfPreview] = useState<{ document: React.ReactNode; fileName: string } | null>(null);
    const [isDownloadingPreviewPdf, setIsDownloadingPreviewPdf] = useState(false);

    const {
        availableClassOptions,
        classKeys,
        schoolId: reduxSchoolId,
        logoUrl: reduxLogoUrl,
        schoolName: reduxSchoolName,
        directorName: reduxDirectorName,
        directorPrefix: reduxDirectorPrefix,
    } = useSelector((state: RootState) => state.schoolSettings);

    const [academicYear, setAcademicYear] = useState('');
    const [semester, setSemester] = useState('1');
    const [academicYearOptions, setAcademicYearOptions] = useState<string[]>([]);

    useEffect(() => {
        const fetchAcademicYears = async () => {
            if (!reduxSchoolId) return;
            try {
                const [calendarSnap, defaultDoc] = await Promise.all([
                    getDocs(collection(firestore, "school-settings", reduxSchoolId, "main_calendar")),
                    getDoc(doc(firestore, "school-settings", reduxSchoolId, "main_calendar", "default")),
                ]);

                const existingYears = calendarSnap.docs
                    .map(d => Number(d.id))
                    .filter(y => Number.isFinite(y) && y > 0)
                    .sort((a, b) => b - a);

                const defaultYear = defaultDoc.exists() ? Number(defaultDoc.data().academicYear) : NaN;

                // แสดงเฉพาะปีการศึกษาที่มีข้อมูลปฏิทินจริงในหน้า /academic/school-calendar (10 ปีล่าสุด)
                // ถ้าปีปัจจุบัน (default) ไม่อยู่ในรายการด้วยเหตุผลใดก็ตาม ให้เพิ่มเข้าไปด้วยเพื่อไม่ให้ dropdown ว่างค่าที่เลือกอยู่
                const yearSet = new Set(existingYears);
                if (Number.isFinite(defaultYear) && defaultYear > 0) yearSet.add(defaultYear);
                const sortedYears = Array.from(yearSet).sort((a, b) => b - a);
                const latest10 = (sortedYears.length > 0 ? sortedYears : [getCurrentThaiYear()]).slice(0, 10);

                setAcademicYearOptions(latest10.map(String));
                setAcademicYear(Number.isFinite(defaultYear) && defaultYear > 0 ? String(defaultYear) : String(latest10[0]));
            } catch (error) {
                console.error("Error fetching academic years:", error);
                const fallbackYear = getCurrentThaiYear();
                setAcademicYearOptions(Array.from({ length: 10 }, (_, i) => String(fallbackYear - i)));
                setAcademicYear(String(fallbackYear));
            }
        };
        fetchAcademicYears();
    }, [reduxSchoolId]);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(15);

    const teacherMapRef = useRef<Record<string, any> | null>(null);
    const ranksCacheRef = useRef<Record<string, Record<string, ClassLevelRankEntry>>>({});

    const fetchStudents = useCallback(async (currentSchoolId: string) => {
        setIsLoading(true);
        try {
            const studentsCollection = collection(firestore, "school-settings", currentSchoolId, "students");
            const q = query(studentsCollection, orderBy("studentId", "asc"));
            const querySnapshot = await getDocs(q);
            const studentsData = querySnapshot.docs.map(d => {
                const data: any = d.data();
                const levelKey = Object.keys(CLASSES).find(k => k === data.classLevel?.toLowerCase() || CLASSES[k as keyof typeof CLASSES] === data.classLevel);
                return {
                    ...data,
                    id: d.id,
                    classLevelKey: levelKey || data.classLevel,
                    seatNumber: String(data.number ?? data.classNumber ?? data.no ?? data.studentNumber ?? ''),
                } as Student;
            }).filter(s => {
                const isCurrent = isStudyingStudent(s as any);
                const isInRange = s.classLevelKey ? classKeys.includes(s.classLevelKey) : false;
                return isCurrent && isInRange;
            });
            setStudents(studentsData);
        } catch (err) {
            console.error("Error fetching students: ", err);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถดึงข้อมูลนักเรียนได้', background: '#2a2b2f', color: '#ffffff' });
        } finally {
            setIsLoading(false);
        }
    }, [classKeys]);

    useEffect(() => {
        if (reduxSchoolId) fetchStudents(reduxSchoolId);
    }, [reduxSchoolId, fetchStudents]);

    useEffect(() => {
        const fetchSchoolInfo = async () => {
            if (!reduxSchoolId) return;
            try {
                const schoolDoc = await getDoc(doc(firestore, "school-settings", reduxSchoolId));
                if (schoolDoc.exists()) {
                    setSchoolInfo(schoolDoc.data());
                    setSchoolId(reduxSchoolId);
                }
            } catch (error) {
                console.error("Error fetching school info:", error);
            }
        };
        fetchSchoolInfo();
    }, [reduxSchoolId]);

    const ensureTeacherMap = async (): Promise<Record<string, any>> => {
        if (teacherMapRef.current) return teacherMapRef.current;
        const activeSchoolId = schoolId || reduxSchoolId;
        const snap = await getDocs(collection(firestore, "school-settings", activeSchoolId as string, "teachers"));
        const map: Record<string, any> = {};
        snap.docs.forEach(d => { map[d.id] = { id: d.id, ...d.data() }; });
        teacherMapRef.current = map;
        return map;
    };

    const ensureClassLevelRanks = async (classLevel: string, year: string, sem: string) => {
        const activeSchoolId = schoolId || reduxSchoolId;
        const cacheKey = `${classLevel}|${year}|${sem}`;
        if (ranksCacheRef.current[cacheKey]) return ranksCacheRef.current[cacheKey];
        const ranks = await computeClassLevelRanks(activeSchoolId as string, classLevel, year, sem);
        ranksCacheRef.current[cacheKey] = ranks;
        return ranks;
    };

    const getImageDataUrl = async (url: string): Promise<string> => {
        if (!url) return '';
        if (url.startsWith('data:')) return url;
        try {
            const response = await fetch(url, { mode: 'cors' });
            if (!response.ok) return url;
            const blob = await response.blob();
            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
            });
        } catch (error) {
            console.warn('Unable to convert school logo for PDF:', error);
            return url;
        }
    };

    const handlePrintReport = async (student: Student) => {
        const activeSchoolId = schoolId || reduxSchoolId;
        const effectiveSchoolName = schoolInfo?.schoolName || reduxSchoolName || '';
        if (!activeSchoolId || (!schoolInfo && !reduxSchoolName)) {
            Swal.fire({ icon: 'warning', title: 'ไม่พบข้อมูลโรงเรียน', text: 'กรุณาตรวจสอบการตั้งค่าข้อมูลโรงเรียนก่อนออกเอกสาร', background: '#2a2b2f', color: '#ffffff' });
            return;
        }
        if (!isSecondaryLevel(student.classLevel)) {
            Swal.fire({ icon: 'info', title: 'รองรับเฉพาะระดับมัธยมศึกษา', text: 'แบบฟอร์ม ปพ.6 สำหรับระดับประถมศึกษาจะเพิ่มในเวอร์ชันถัดไป', background: '#2a2b2f', color: '#ffffff' });
            return;
        }
        if (!academicYear) {
            Swal.fire({ icon: 'warning', title: 'กรุณาระบุปีการศึกษา', background: '#2a2b2f', color: '#ffffff' });
            return;
        }

        setIsExporting(student.id);
        try {
            const rawLogo = schoolInfo?.logoUrl || reduxLogoUrl || schoolInfo?.logo || schoolInfo?.schoolLogoUrl || '/Epp5 online.png';
            const [teacherMap, effectiveLogoUrl] = await Promise.all([
                ensureTeacherMap(),
                getImageDataUrl(rawLogo),
            ]);
            const [reportData, ranks] = await Promise.all([
                fetchPorBor6ReportData(activeSchoolId as string, teacherMap, student.id, student.classLevel, academicYear, semester) as Promise<PorBor6ReportData>,
                ensureClassLevelRanks(student.classLevel, academicYear, semester),
            ]);

            const homeroomTeacherNames = Object.values(teacherMap)
                .filter((t: any) => {
                    const rawGrade = String(t.homeroomGrade || '').trim();
                    const rawRoom = String(t.homeroomRoom || '').trim();
                    const studentClass = String(student.classLevel || '').trim();
                    const studentRoom = String(student.room || '').trim();

                    if (rawGrade === `${studentClass}/${studentRoom}`) return true;
                    if (rawGrade === studentClass && (!studentRoom || !rawRoom || rawRoom === studentRoom)) return true;
                    return false;
                })
                .map((t: any) => (t.firstName ? `${t.title || ''}${t.firstName} ${t.lastName || ''}`.trim() : (t.name || '')))
                .filter(Boolean);

            const rankEntry = ranks[student.id];
            const today = new Date();
            const issueDate = { day: today.getDate(), month: today.toLocaleDateString('th-TH', { month: 'long' }), year: getThaiYear(today) };
            const effectiveDirector = [
                schoolInfo?.directorPrefix || reduxDirectorPrefix,
                schoolInfo?.directorName || reduxDirectorName,
            ].filter(Boolean).join(' ');

            const docToRender = (
                <PorBor6ReportDocument
                    schoolInfo={{
                        schoolName: effectiveSchoolName,
                        logoUrl: effectiveLogoUrl,
                        directorName: effectiveDirector,
                    }}
                    student={{
                        title: student.title,
                        firstName: student.firstName,
                        lastName: student.lastName,
                        studentId: student.studentId,
                        classLevel: student.classLevel,
                        room: student.room,
                        seatNumber: student.seatNumber,
                    }}
                    academicYear={academicYear}
                    semester={semester}
                    homeroomTeacherNames={homeroomTeacherNames}
                    subjects={reportData.subjects}
                    currentSummary={reportData.currentSummary}
                    cumulativeSummary={reportData.cumulativeSummary}
                    classRank={rankEntry?.classRank ?? null}
                    gradeLevelRank={rankEntry?.gradeLevelRank ?? null}
                    issueDate={issueDate}
                />
            );

            setPdfPreview({ document: docToRender, fileName: `ปพ6_${student.firstName}_${student.lastName}.pdf` });
        } catch (error) {
            console.error("Error generating ปพ.6:", error);
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'ไม่สามารถสร้างรายงานผลการเรียนได้ กรุณาลองใหม่อีกครั้ง', background: '#2a2b2f', color: '#ffffff' });
        } finally {
            setIsExporting(null);
        }
    };

    const downloadPreviewPdf = async () => {
        if (!pdfPreview) return;
        setIsDownloadingPreviewPdf(true);
        try {
            const blob = await pdf(pdfPreview.document as any).toBlob();
            saveAs(blob, pdfPreview.fileName);
        } finally {
            setIsDownloadingPreviewPdf(false);
        }
    };

    const filteredStudents = students.filter(student =>
        `${student.title}${student.firstName} ${student.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.studentId.toLowerCase().includes(searchTerm.toLowerCase())
    ).filter(student => !selectedClassLevel || student.classLevelKey === selectedClassLevel)
        .filter(student => !selectedRoom || student.room === selectedRoom);

    const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentStudents = filteredStudents.slice(indexOfFirstItem, indexOfLastItem);

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1c1c24] text-gray-900 dark:text-white">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="mb-8">
                        <div className="flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#2a2b2f] lg:flex-row lg:items-center lg:justify-between mb-6">
                            <div className="flex min-w-0 flex-1 items-center gap-4">
                                <BackButton to="/academic/hub/registration" />
                                <div className="min-w-0">
                                    <h1 className="text-3xl font-bold tracking-tight">รายงานผลการเรียน (ปพ.6)</h1>
                                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                                        ค้นหารายชื่อนักเรียนเพื่อพิมพ์รายงานผลการเรียนรายบุคคล พร้อมเกรดเฉลี่ยและอันดับที่ (รองรับระดับมัธยมศึกษา ม.1-6 ในเวอร์ชันนี้)
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 bg-white dark:bg-[#2a2b2f] p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-white/5">
                            <div className="relative md:col-span-2">
                                <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="text"
                                    placeholder="ค้นหาชื่อ หรือ รหัสนักเรียน..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <div className="w-full">
                                <Select
                                    options={[{ value: '', label: 'ทุกระดับชั้น' }, ...availableClassOptions.map(([key, label]: [string, string]) => ({ value: key, label }))]}
                                    value={selectedClassLevel ? { value: selectedClassLevel, label: CLASSES[selectedClassLevel as keyof typeof CLASSES] || selectedClassLevel } : { value: '', label: 'ทุกระดับชั้น' }}
                                    onChange={(option: any) => setSelectedClassLevel(option?.value || '')}
                                    styles={compactSelectStyles}
                                    placeholder="เลือกชั้น..."
                                    isSearchable={false}
                                />
                            </div>
                            <div className="w-full">
                                <Select
                                    options={[{ value: '', label: 'ทุกห้องเรียน' }, ...Array.from({ length: 15 }, (_, i) => ({ value: (i + 1).toString(), label: `ห้อง ${i + 1}` }))]}
                                    value={selectedRoom ? { value: selectedRoom, label: `ห้อง ${selectedRoom}` } : { value: '', label: 'ทุกห้องเรียน' }}
                                    onChange={(option: any) => setSelectedRoom(option?.value || '')}
                                    styles={compactSelectStyles}
                                    placeholder="เลือกห้อง..."
                                    isSearchable={false}
                                />
                            </div>
                            <div className="w-full">
                                <Select
                                    options={academicYearOptions.map(year => ({ value: year, label: `ปีการศึกษา ${year}` }))}
                                    value={academicYear ? { value: academicYear, label: `ปีการศึกษา ${academicYear}` } : null}
                                    onChange={(option: any) => setAcademicYear(option?.value || '')}
                                    styles={compactSelectStyles}
                                    placeholder="เลือกปีการศึกษา..."
                                    isSearchable={false}
                                />
                            </div>
                            <div className="w-full">
                                <Select
                                    options={[{ value: '1', label: 'ภาคเรียนที่ 1' }, { value: '2', label: 'ภาคเรียนที่ 2' }]}
                                    value={{ value: semester, label: `ภาคเรียนที่ ${semester}` }}
                                    onChange={(option: any) => setSemester(option?.value || '1')}
                                    styles={compactSelectStyles}
                                    isSearchable={false}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#2a2b2f] rounded-2xl shadow-xl border border-gray-100 dark:border-white/5 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 dark:bg-white/5">
                                    <tr>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16 text-center">ลำดับ</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชื่อ-นามสกุล</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">รหัสนักเรียน</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">ชั้น / ห้อง</th>
                                        <th className="px-6 py-4 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right">ดำเนินการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                                    {isLoading ? (
                                        Array.from({ length: 5 }).map((_, i) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-8 mx-auto"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-48"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-24"></div></td>
                                                <td className="px-6 py-4"><div className="h-4 bg-gray-200 dark:bg-white/10 rounded w-16"></div></td>
                                                <td className="px-6 py-4"><div className="h-8 bg-gray-200 dark:bg-white/10 rounded w-20 ml-auto"></div></td>
                                            </tr>
                                        ))
                                    ) : currentStudents.length > 0 ? (
                                        currentStudents.map((student, index) => (
                                            <tr key={student.id} className="hover:bg-gray-50 dark:hover:bg-white/[0.02] transition-colors group">
                                                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 text-center font-medium">
                                                    {indexOfFirstItem + index + 1}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-3">
                                                        <ProfileAvatar
                                                            src={student.profileImageUrl || `https://ui-avatars.com/api/?name=${student.firstName}+${student.lastName}&background=random`}
                                                            alt=""
                                                            className="w-10 h-10 border border-gray-200 dark:border-white/10"
                                                        />
                                                        <div>
                                                            <div className="text-sm font-bold text-gray-900 dark:text-white">
                                                                {`${student.title}${student.firstName} ${student.lastName}`}
                                                            </div>
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                {student.studentStatus}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 font-mono">
                                                    {student.studentId}
                                                </td>
                                                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300">
                                                    {`${student.classLevel} / ${student.room}`}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handlePrintReport(student)}
                                                        disabled={isExporting === student.id}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-gray-500 text-white rounded-xl transition-all font-medium shadow-lg shadow-teal-500/20 active:scale-95 whitespace-nowrap text-sm"
                                                    >
                                                        {isExporting === student.id ? (
                                                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                                                        ) : (
                                                            <FaFileAlt size={14} />
                                                        )}
                                                        พิมพ์ ปพ.6
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-20 text-center">
                                                <div className="flex flex-col items-center justify-center">
                                                    <div className="w-16 h-16 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center mb-4">
                                                        <FaFileAlt className="text-gray-400 text-2xl" />
                                                    </div>
                                                    <p className="text-gray-500 dark:text-gray-400 font-medium">ไม่พบข้อมูลนักเรียน</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {!isLoading && totalPages > 1 && (
                            <div className="px-6 py-4 bg-gray-50 dark:bg-white/5 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
                                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                    แสดง {indexOfFirstItem + 1} ถึง {Math.min(indexOfLastItem, filteredStudents.length)} จาก {filteredStudents.length} รายการ
                                </div>
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all">
                                        <ChevronsLeft size={18} />
                                    </button>
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all">
                                        <ChevronLeft size={18} />
                                    </button>
                                    <div className="px-4 text-sm font-bold">{currentPage} / {totalPages}</div>
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all">
                                        <ChevronRight size={18} />
                                    </button>
                                    <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="p-2 rounded-lg hover:bg-white dark:hover:bg-white/10 disabled:opacity-30 transition-all">
                                        <ChevronsRight size={18} />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {pdfPreview && (
                <div className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setPdfPreview(null)}>
                    <div className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <h2 className="text-base font-bold text-gray-900 dark:text-white">ตัวอย่างเอกสาร — {pdfPreview.fileName}</h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={downloadPreviewPdf}
                                    disabled={isDownloadingPreviewPdf}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isDownloadingPreviewPdf ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
                                    {isDownloadingPreviewPdf ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPdfPreview(null)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                                    title="ปิด"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
                            <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                                {pdfPreview.document as any}
                            </PDFViewer>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

export default PorBor6Page;
