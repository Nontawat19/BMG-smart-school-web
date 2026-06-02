import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import { firestore } from '@/firebase';
import { collection, getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';
import Swal from 'sweetalert2';
import { FaIdCard, FaSearch, FaSave, FaArrowLeft, FaEye, FaEyeSlash, FaUserGraduate, FaChalkboardTeacher, FaChevronLeft, FaChevronRight, FaAngleDoubleLeft, FaAngleDoubleRight } from 'react-icons/fa';
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

  const isStudent = type === 'students';

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
      <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <Link to={isStudent ? `/school/${schoolId}/students` : `/school/${schoolId}/teachers`} className="inline-flex items-center text-indigo-600 dark:text-indigo-400 hover:underline mb-2 text-sm font-medium">
                <FaArrowLeft className="mr-2" /> กลับหน้ารายชื่อ{isStudent ? 'นักเรียน' : 'ครู'}
              </Link>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
                <FaIdCard className="text-indigo-500" />
                จับคู่รหัส RFID กับ{isStudent ? 'นักเรียน' : 'ครู'}
              </h1>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                ระบุรหัส RFID สำหรับ{isStudent ? 'นักเรียน' : 'ครู'}แต่ละคนเพื่อใช้กับระบบลงเวลา
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
              <div className="relative w-full sm:w-64">
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
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <FaSearch className="text-gray-400" />
                </div>
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={`ค้นหาชื่อ, ${isStudent ? 'รหัสนักเรียน' : 'รหัสครู'}, RFID...`}
                  name={searchAutocompleteTokenRef.current}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-form-type="other"
                  className="pl-10 pr-4 py-2.5 w-full bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all shadow-sm text-sm"
                  value={searchTerm}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  onInput={(e) => handleSearchChange((e.target as HTMLInputElement).value)}
                />
              </div>
              
              {isStudent && (
                <div className="flex gap-2">
                  <select
                    value={selectedClassLevel}
                    onChange={(e) => setSelectedClassLevel(e.target.value)}
                    className="pl-3 pr-8 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ทุกชั้น</option>
                    {classLevelOptions.map(level => <option key={level} value={level}>{level}</option>)}
                  </select>
                  <select
                    value={selectedRoom}
                    onChange={(e) => setSelectedRoom(e.target.value)}
                    className="pl-3 pr-8 py-2.5 bg-white dark:bg-[#2a2b2f] border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm text-gray-900 dark:text-white"
                  >
                    <option value="">ทุกห้อง</option>
                    {roomOptions.map(room => <option key={room} value={room}>{room}</option>)}
                  </select>
                </div>
              )}

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-sm hover:shadow-md active:scale-95 text-sm whitespace-nowrap disabled:opacity-50"
              >
                <FaSave size={14} />
                <span>{isSaving ? 'กำลังบันทึก...' : 'บันทึกข้อมูล'}</span>
              </button>
            </div>
          </header>

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
                      <tr>
                        <td colSpan={5} className="text-center py-10 text-gray-500">กำลังโหลดข้อมูล{isStudent ? 'นักเรียน' : 'ครู'}...</td>
                      </tr>
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
