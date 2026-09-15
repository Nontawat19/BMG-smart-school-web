import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import BackButton from '@/components/Shared/BackButton';
import { firestore } from '@/firebase';
import { collection, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { FaIdCard, FaSearch, FaSave, FaEye, FaEyeSlash, FaUserGraduate, FaChalkboardTeacher, FaChevronLeft, FaChevronRight, FaAngleDoubleLeft, FaAngleDoubleRight, FaFileExcel, FaFileDownload } from 'react-icons/fa';
import { isStudyingStudent } from '@/utils/studentStatusUtils';
import { isActiveTeacherSummaryStatus } from '@/utils/ownerStatsUtils';
import { isAttendanceEntryOnly } from '@/utils/attendanceRoles';
import { getLevelsByRange } from '@/utils/schoolUtils';

// Generic User interface for both Students and Teachers
interface Person {
  id: string;
  studentId?: string; // For students
  teacherId?: string; // For teachers
  title: string;
  firstName: string;
  lastName: string;
  classLevel?: string; // For students
  room?: string; // For students
  studentNumber?: string; // For students
  department?: string; // For teachers
  status?: string;
  studentStatus?: string;
  role?: string | string[];
  rfid?: string;
  profileImageUrl?: string;
}

const normalizeFilterValue = (value: unknown) => String(value || '').trim();

const isLikelyEmailAutofill = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const compareNumericText = (a: string, b: string) => {
  const numA = Number(a);
  const numB = Number(b);
  if (Number.isFinite(numA) && Number.isFinite(numB) && numA !== numB) return numA - numB;
  return a.localeCompare(b, 'th', { numeric: true, sensitivity: 'base' });
};

const MapRfidPage: React.FC = () => {
  const { schoolId, type } = useParams<{ schoolId: string; type: 'students' | 'teachers' }>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchAutocompleteTokenRef = useRef(`bms-rfid-filter-${Math.random().toString(36).slice(2)}`);
  const [people, setPeople] = useState<Person[]>([]);
  const [rfidMap, setRfidMap] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [visibilityMap, setVisibilityMap] = useState<Record<string, boolean>>({});
  const [selectedClassLevel, setSelectedClassLevel] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [availableLevels, setAvailableLevels] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);

  const isStudent = type === 'students';
  const idFieldLabel = isStudent ? 'รหัสนักเรียน' : 'รหัสครู';

  const handleSearchChange = (value: string) => {
    setSearchTerm(isLikelyEmailAutofill(value) ? '' : value);
  };

  useEffect(() => {
    setSearchTerm('');

    const clearBrowserEmailAutofill = () => {
      const input = searchInputRef.current;
      if (!input) return;

      if (isLikelyEmailAutofill(input.value)) {
        input.value = '';
        setSearchTerm('');
      }
    };

    clearBrowserEmailAutofill();
    const timers = [50, 250, 1000, 2000].map((delay) => window.setTimeout(clearBrowserEmailAutofill, delay));
    return () => timers.forEach(window.clearTimeout);
  }, [schoolId, type]);

  useEffect(() => {
    if (!schoolId || !type) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const peopleCollection = collection(firestore, "school-settings", schoolId, type);
        const querySnapshot = await getDocs(peopleCollection);
        const peopleData = querySnapshot.docs
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
          } as Person))
          .filter(person => {
            if (isAttendanceEntryOnly(person.role)) return false;
            if (isStudent) {
              return isStudyingStudent(person);
            }
            return isActiveTeacherSummaryStatus(person.status || 'อยู่');
          });

        // Client-side sorting
        peopleData.sort((a, b) => {
          if (isStudent) {
            const classCompare = (a.classLevel || '').localeCompare(b.classLevel || '');
            if (classCompare !== 0) return classCompare;
            const roomCompare = compareNumericText(normalizeFilterValue(a.room), normalizeFilterValue(b.room));
            if (roomCompare !== 0) return roomCompare;
            return (parseInt(a.studentNumber || '0', 10)) - (parseInt(b.studentNumber || '0', 10));
          } else {
            return (a.firstName || '').localeCompare(b.firstName || '');
          }
        });

        setPeople(peopleData);

        const initialRfidMap: Record<string, string> = {};
        peopleData.forEach(person => {
          if (person.rfid) {
            initialRfidMap[person.id] = person.rfid;
          }
        });
        setRfidMap(initialRfidMap);

      } catch (err) {
        console.error(`Error fetching ${type}: `, err);
        Swal.fire('เกิดข้อผิดพลาด', `ไม่สามารถดึงข้อมูล${isStudent ? 'นักเรียน' : 'ครู'}ได้`, 'error');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [schoolId, type, isStudent]);

  useEffect(() => {
    const fetchLevels = async () => {
      if (!schoolId || !isStudent) return;
      try {
        const schoolRef = doc(firestore, "school-settings", schoolId);
        const schoolSnap = await getDoc(schoolRef);
        if (schoolSnap.exists()) {
          const data = schoolSnap.data();
          setAvailableLevels(getLevelsByRange(data.opportunityExpansionLevel));
        }
      } catch (error) {
        console.error("Error fetching school levels:", error);
      }
    };
    fetchLevels();
  }, [schoolId, isStudent]);

  const classLevelOptions = useMemo(() => {
    if (!isStudent) return [];

    const levelsFromStudents = Array.from(new Set(
      people
        .map(person => normalizeFilterValue(person.classLevel))
        .filter(Boolean)
    ));
    const mergedLevels = Array.from(new Set([...availableLevels, ...levelsFromStudents]));

    return mergedLevels.filter(level =>
      people.some(person => normalizeFilterValue(person.classLevel) === level) || availableLevels.includes(level)
    );
  }, [availableLevels, people, isStudent]);

  const roomOptions = useMemo(() => {
    if (!isStudent) return [];

    const rooms = people
      .filter(person => !selectedClassLevel || normalizeFilterValue(person.classLevel) === selectedClassLevel)
      .map(person => normalizeFilterValue(person.room))
      .filter(Boolean);

    return Array.from(new Set(rooms)).sort(compareNumericText);
  }, [people, selectedClassLevel, isStudent]);

  const handleRfidChange = (personId: string, rfid: string) => {
    setRfidMap(prev => ({
      ...prev,
      [personId]: rfid,
    }));
  };

  // member_id ในไฟล์ Excel มักถูก Excel มองเป็นตัวเลขแล้วตัดเลข 0 นำหน้าทิ้ง (เช่น 05977 -> 5977)
  // เติม 0 นำหน้าคืนให้ครบ 5 หลัก เหมือนตรรกะเดียวกับหน้า ImportStudentPage
  const normalizeMemberId = (value: unknown) => {
    const raw = String(value ?? '').trim();
    if (/^\d+$/.test(raw) && raw.length < 5) {
      return raw.padStart(5, '0');
    }
    return raw;
  };

  const handleDownloadTemplate = () => {
    const rows = filteredPeople.map(person => ({
      rfid_code: rfidMap[person.id] || '',
      member_id: person.studentId || person.teacherId || '',
    }));

    if (rows.length === 0) {
      Swal.fire('ไม่มีข้อมูล', `ไม่พบรายชื่อ${isStudent ? 'นักเรียน' : 'ครู'}ให้สร้างแม่แบบ (ลองล้างตัวกรองก่อน)`, 'warning');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(rows, { header: ['rfid_code', 'member_id'] });
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RFID_Template');
    XLSX.writeFile(wb, `RFID_Import_Template_${isStudent ? 'Students' : 'Teachers'}.xlsx`);
  };

  const handleImportClick = () => {
    importFileInputRef.current?.click();
  };

  const handleImportFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    e.target.value = ''; // เผื่อเลือกไฟล์เดิมซ้ำ จะได้ยิง onChange อีกครั้ง
    if (!selectedFile) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const isCsv = selectedFile.name.toLowerCase().endsWith('.csv');
        const wb = XLSX.read(event.target?.result, { type: isCsv ? 'string' : 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

        if (data.length < 2) {
          Swal.fire('ไฟล์ว่างเปล่า', 'ไม่พบข้อมูลในไฟล์ที่นำเข้า', 'warning');
          return;
        }

        const headers = data[0].map(h => String(h || '').trim().toLowerCase());
        const rfidColIndex = headers.indexOf('rfid_code');
        const memberColIndex = headers.indexOf('member_id');

        if (rfidColIndex === -1 || memberColIndex === -1) {
          Swal.fire('รูปแบบไฟล์ไม่ถูกต้อง', 'ไฟล์ต้องมีคอลัมน์ชื่อ "rfid_code" และ "member_id" ตามแม่แบบ', 'error');
          return;
        }

        // person.studentId/teacherId (รหัส 5 หลัก) -> person.id เพื่อจับคู่กับ member_id ในไฟล์
        const idToPersonId = new Map<string, string>();
        people.forEach(person => {
          const idValue = normalizeMemberId(person.studentId || person.teacherId || '');
          if (idValue) idToPersonId.set(idValue, person.id);
        });

        const nextRfidMap = { ...rfidMap };
        let matchedCount = 0;
        let skippedBlankCount = 0;
        const notFoundIds: string[] = [];

        data.slice(1).forEach(row => {
          const memberId = normalizeMemberId(row[memberColIndex]);
          const rfidCode = String(row[rfidColIndex] ?? '').trim();
          if (!memberId) return;
          if (!rfidCode) { skippedBlankCount += 1; return; }

          const personId = idToPersonId.get(memberId);
          if (!personId) {
            notFoundIds.push(memberId);
            return;
          }

          nextRfidMap[personId] = rfidCode;
          matchedCount += 1;
        });

        setRfidMap(nextRfidMap);

        const notFoundSummary = notFoundIds.length > 0
          ? `<br/><br/>ไม่พบ${idFieldLabel}ในระบบ ${notFoundIds.length} รายการ:<br/>${notFoundIds.slice(0, 15).join(', ')}${notFoundIds.length > 15 ? ' ...' : ''}`
          : '';

        Swal.fire({
          icon: notFoundIds.length > 0 ? 'warning' : 'success',
          title: 'นำเข้าข้อมูลเสร็จสิ้น',
          html: `จับคู่ RFID สำเร็จ ${matchedCount} รายการ${skippedBlankCount > 0 ? ` (ข้าม ${skippedBlankCount} แถวที่ไม่มีรหัส RFID)` : ''}${notFoundSummary}<br/><br/><b>ข้อมูลยังไม่ถูกบันทึก</b> กรุณาตรวจสอบในตารางแล้วกด "บันทึกข้อมูล" อีกครั้ง`,
        });
      } catch (err) {
        console.error('Error importing RFID file:', err);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถอ่านไฟล์ที่นำเข้าได้ กรุณาตรวจสอบรูปแบบไฟล์', 'error');
      } finally {
        setIsImporting(false);
      }
    };

    if (selectedFile.name.toLowerCase().endsWith('.csv')) {
      reader.readAsText(selectedFile, 'utf-8');
    } else {
      reader.readAsBinaryString(selectedFile);
    }
  };

  const handleSave = async () => {
    if (!schoolId || !type) return;

    // Check for duplicate RFIDs before saving
    const rfidValues = Object.values(rfidMap).filter(rfid => rfid.trim() !== '');
    const uniqueRfidValues = new Set(rfidValues);
    if (rfidValues.length !== uniqueRfidValues.size) {
        Swal.fire('ข้อมูลซ้ำซ้อน', 'พบรหัส RFID ซ้ำกันในรายการ กรุณาตรวจสอบ', 'warning');
        return;
    }

    setIsSaving(true);
    Swal.fire({
      title: 'กำลังบันทึก...',
      text: 'กรุณารอสักครู่',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading(),
    });

    try {
      const batch = writeBatch(firestore);
      people.forEach(person => {
        const personRef = doc(firestore, "school-settings", schoolId, type, person.id);
        const newRfid = rfidMap[person.id] || '';
        // Only update if the RFID has changed
        if (newRfid !== (person.rfid || '')) {
          batch.update(personRef, { rfid: newRfid });
        }
      });
      await batch.commit();
      Swal.fire('บันทึกสำเร็จ!', `ข้อมูล RFID ของ${isStudent ? 'นักเรียน' : 'ครู'}ถูกอัปเดตแล้ว`, 'success');
    } catch (err) {
      console.error("Error saving RFID data: ", err);
      Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลได้', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredPeople = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return people.filter(person => {
      const name = `${person.title}${person.firstName} ${person.lastName}`.toLowerCase();
      const id = (person.studentId || person.teacherId || '').toLowerCase();
      const rfid = (rfidMap[person.id] || '').toLowerCase();
      
      const matchesSearch = 
        !normalizedSearchTerm ||
        name.includes(normalizedSearchTerm) ||
        id.includes(normalizedSearchTerm) ||
        rfid.includes(normalizedSearchTerm);

      if (isStudent) {
        const matchesClass = selectedClassLevel === '' || normalizeFilterValue(person.classLevel) === selectedClassLevel;
        const matchesRoom = selectedRoom === '' || normalizeFilterValue(person.room) === selectedRoom;
        return matchesSearch && matchesClass && matchesRoom;
      }

      return matchesSearch;
    });
  }, [people, searchTerm, rfidMap, selectedClassLevel, selectedRoom, isStudent]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredPeople.length / itemsPerPage);
  const currentItems = useMemo(() => {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    return filteredPeople.slice(indexOfFirstItem, indexOfLastItem);
  }, [filteredPeople, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedClassLevel, selectedRoom]);

  useEffect(() => {
    if (selectedRoom && !roomOptions.includes(selectedRoom)) {
      setSelectedRoom('');
    }
  }, [roomOptions, selectedRoom]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentIndex: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const nextPerson = filteredPeople[currentIndex + 1];
      if (nextPerson) {
        const nextInput = document.getElementById(`rfid-input-${nextPerson.id}`);
        nextInput?.focus();
      }
    }
  };

  const handleToggleVisibility = (personId: string) => {
    setVisibilityMap(prev => ({
      ...prev,
      [personId]: !prev[personId],
    }));
  };

  return (
    <MainLayout>
      <div className="min-h-screen bg-gray-50 dark:bg-[#15161a] text-gray-900 dark:text-white px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Header card — จัดตามหน้า HomeroomStudentListPage: back button + badge + title ซ้าย, ปุ่มหลัก (บันทึก) ขวา */}
          <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm dark:border-gray-800 dark:bg-[#242529] lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex items-start gap-3">
                <BackButton to={isStudent ? `/school/${schoolId}/students` : `/school/${schoolId}/teachers`} className="mb-0 shrink-0" />
                <div className="min-w-0 pt-1">
                  <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-3 py-1 text-xs font-black text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                    <FaIdCard size={14} />
                    RFID {isStudent ? 'นักเรียน' : 'ครู'}
                  </div>
                  <h1 className="text-2xl font-black tracking-tight">จับคู่รหัส RFID กับ{isStudent ? 'นักเรียน' : 'ครู'}</h1>
                </div>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 lg:pl-[52px]">
                ระบุรหัส RFID สำหรับ{isStudent ? 'นักเรียน' : 'ครู'}แต่ละคนเพื่อใช้กับระบบลงเวลา
              </p>
            </div>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-5 text-sm font-black text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-white/10"
            >
              <FaSave size={16} />
              {isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}
            </button>
          </div>

          {/* Toolbar card — ค้นหา/ตัวกรอง/นำเข้า-ส่งออก เรียงเป็น grid แบบเดียวกับหน้า HomeroomStudentListPage */}
          <div className={`mb-6 grid grid-cols-1 gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-[#242529] ${isStudent ? 'md:grid-cols-5' : 'md:grid-cols-3'}`}>
            <label className="space-y-1">
              <span className="text-xs font-black text-gray-500">ค้นหา</span>
              <div className="relative">
                <input
                  type="text"
                  name="username"
                  autoComplete="username"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute h-0 w-0 opacity-0 pointer-events-none"
                />
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="absolute h-0 w-0 opacity-0 pointer-events-none"
                />
                <FaSearch size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={`ชื่อ, ${idFieldLabel}, RFID...`}
                  name={searchAutocompleteTokenRef.current}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onInput={(e) => handleSearchChange((e.target as HTMLInputElement).value)}
                />
              </div>
            </label>

            {isStudent && (
              <>
                <label className="space-y-1">
                  <span className="text-xs font-black text-gray-500">ชั้น</span>
                  <select
                    value={selectedClassLevel}
                    onChange={(e) => setSelectedClassLevel(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                  >
                    <option value="">ทุกชั้น</option>
                    {classLevelOptions.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-black text-gray-500">ห้อง</span>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-gray-700 dark:bg-[#1e1f21]"
                  >
                    <option value="">ทุกห้อง</option>
                    {roomOptions.map(room => <option key={room} value={room}>{room}</option>)}
                  </select>
                </label>
              </>
            )}

            <input
              ref={importFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleImportFileChange}
            />
            <div className="space-y-1">
              <span className="block text-xs font-black text-transparent select-none">แม่แบบ</span>
              <button
                onClick={handleDownloadTemplate}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 bg-gray-50 text-sm font-bold text-gray-700 transition hover:bg-gray-100 active:scale-95 dark:border-gray-700 dark:bg-[#1e1f21] dark:text-gray-300 dark:hover:bg-gray-800"
                title={`ดาวน์โหลดแม่แบบ Excel (รหัส RFID + ${idFieldLabel} ของรายชื่อที่กรองอยู่)`}
              >
                <FaFileDownload size={14} />
                <span>ดาวน์โหลดแม่แบบ</span>
              </button>
            </div>
            <div className="space-y-1">
              <span className="block text-xs font-black text-transparent select-none">นำเข้า</span>
              <button
                onClick={handleImportClick}
                disabled={isImporting}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-500 active:scale-95 disabled:opacity-50"
              >
                <FaFileExcel size={14} />
                <span>{isImporting ? 'กำลังนำเข้า...' : 'นำเข้าจาก Excel'}</span>
              </button>
            </div>
          </div>

          <main>
            <div className="bg-white dark:bg-[#2a2b2f]/60 rounded-2xl shadow-lg ring-1 ring-black/5 dark:ring-white/5">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-700">
                  <thead className="bg-gray-100 dark:bg-[#2a2b2f]">
                    <tr>
                      <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 sm:pl-6 w-16">{isStudent ? 'เลขที่' : 'ลำดับ'}</th>
                      <th scope="col" className="py-3.5 pr-3 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">ชื่อ-สกุล</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">{isStudent ? 'รหัสนักเรียน' : 'รหัสครู'}</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300">{isStudent ? 'ชั้น/ห้อง' : 'ฝ่ายงาน'}</th>
                      <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-600 dark:text-gray-300 w-1/3">รหัส RFID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-800 bg-white dark:bg-[#1e1f21]">
                    {isLoading ? (
                      [...Array(8)].map((_, i) => (
                        <tr key={`skeleton-${i}`}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 sm:pl-6"><div className="h-3.5 w-6 mx-auto rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                          <td className="whitespace-nowrap py-4 pr-3"><div className="h-3.5 w-32 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                          <td className="whitespace-nowrap px-3 py-4"><div className="h-3.5 w-20 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                          <td className="whitespace-nowrap px-3 py-4"><div className="h-3.5 w-16 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                          <td className="whitespace-nowrap px-3 py-4"><div className="h-3.5 w-24 rounded bg-gray-200 dark:bg-gray-700 animate-pulse"></div></td>
                        </tr>
                      ))
                    ) : filteredPeople.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-gray-500">ไม่พบข้อมูล{isStudent ? 'นักเรียน' : 'ครู'}ที่ตรงกับคำค้นหา</td>
                      </tr>
                    ) : (
                      currentItems.map((person, index) => (
                        <tr key={person.id} className="hover:bg-gray-50 dark:hover:bg-[#2a2b2f]/50 transition-colors">
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm text-center font-medium text-gray-500 dark:text-gray-400 sm:pl-6">
                            {(currentPage - 1) * itemsPerPage + index + 1}
                          </td>
                          <td className="whitespace-nowrap py-4 pr-3 text-sm">
                            <div className="flex items-center gap-3">
                                <div className="h-8 w-8 flex-shrink-0 relative">
                                  <img
                                    className="h-8 w-8 rounded-full object-cover shadow-sm border border-gray-200 dark:border-gray-700"
                                    src={person.profileImageUrl || `https://ui-avatars.com/api/?name=${person.firstName}+${person.lastName}&background=random&color=fff&bold=true`}
                                    alt={`${person.firstName} ${person.lastName}`}
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${person.firstName}+${person.lastName}&background=random&color=fff&bold=true`;
                                    }}
                                  />
                                  <div className="absolute -bottom-1 -right-1">
                                    {isStudent ? (
                                      <div className="bg-indigo-500 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-[#1e1f21]">
                                        <FaUserGraduate size={8} />
                                      </div>
                                    ) : (
                                      <div className="bg-emerald-500 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-[#1e1f21]">
                                        <FaChalkboardTeacher size={8} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="font-medium text-gray-900 dark:text-gray-200">{`${person.title}${person.firstName} ${person.lastName}`}</div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">{person.studentId || person.teacherId}</td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 dark:text-gray-400">
                              {isStudent ? `${person.classLevel}/${person.room}` : (person.department || '-')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <div className="relative">
                              <input
                                id={`rfid-input-${person.id}`}
                                name={`rfid-${person.id}`}
                                type={visibilityMap[person.id] ? "text" : "password"}
                                value={rfidMap[person.id] || ''}
                                onChange={(e) => handleRfidChange(person.id, e.target.value)}
                                placeholder="แตะบัตรหรือกรอกรหัส..."
                                onKeyDown={(e) => handleKeyDown(e, (currentPage - 1) * itemsPerPage + index)}
                                autoComplete="new-password"
                                autoCorrect="off"
                                autoCapitalize="none"
                                spellCheck={false}
                                data-lpignore="true"
                                data-1p-ignore="true"
                                data-form-type="other"
                                className="w-full bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 pr-10 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
                              />
                              <button
                                type="button"
                                onClick={() => handleToggleVisibility(person.id)}
                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                              >
                                {visibilityMap[person.id] ? <FaEyeSlash /> : <FaEye />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination UI */}
              {totalPages > 1 && (
                <div className="px-6 py-4 bg-gray-50 dark:bg-[#2a2b2f]/80 border-t border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    แสดง {(currentPage - 1) * itemsPerPage + 1} ถึง {Math.min(currentPage * itemsPerPage, filteredPeople.length)} จาก {filteredPeople.length} รายการ
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition-colors text-gray-600 dark:text-gray-400 flex items-center gap-1"
                    >
                      <FaAngleDoubleLeft size={12} />
                      <span className="text-xs font-medium">หน้าแรก</span>
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition-colors text-gray-600 dark:text-gray-400 flex items-center gap-1 px-3"
                    >
                      <FaChevronLeft size={12} />
                      <span className="text-xs font-medium">ย้อนกลับ</span>
                    </button>

                    <div className="hidden md:flex items-center gap-1 mx-2">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum = i + 1;
                        if (totalPages > 5) {
                          const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
                          pageNum = start + i;
                        }
                        return (
                          <button
                            key={pageNum}
                            onClick={() => setCurrentPage(pageNum)}
                            className={`w-8 h-8 flex items-center justify-center rounded-lg text-sm font-medium transition-all ${
                              currentPage === pageNum
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'hover:bg-white dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 border border-transparent hover:border-gray-300'
                            }`}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition-colors text-gray-600 dark:text-gray-400 flex items-center gap-1 px-3"
                    >
                      <span className="text-xs font-medium">ถัดไป</span>
                      <FaChevronRight size={12} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 disabled:opacity-30 transition-colors text-gray-600 dark:text-gray-400 flex items-center gap-1"
                    >
                      <span className="text-xs font-medium">หน้าสุดท้าย</span>
                      <FaAngleDoubleRight size={12} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </MainLayout>
  );
};

export default MapRfidPage;
