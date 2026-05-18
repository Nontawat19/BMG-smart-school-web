import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import BackButton from "@/components/Shared/BackButton";
import MainLayout from "@/layouts/MainLayout";
import { RootState } from '@/store';
import { firestore as db, storage } from '@/firebase';
import { collection, doc, getDoc, getDocs, query, Timestamp, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import Swal from 'sweetalert2';
import { Camera, Home, ImagePlus, MessageSquareText, Trash2, X } from 'lucide-react';
import { fetchTeachersMap } from '@/store/slices/userMapSlice';
import { fetchCalendar } from '@/store/slices/calendarSlice';
import { isNonOfficialHoliday } from '@/utils/calendarUtils';
import { CLASSES } from '@/utils/schoolUtils';
import { getCurrentThaiYear } from '@/utils/dateUtils';
import { Student, CourseSchedule } from './ClassroomAttendance/types';
import { DAYS } from './ClassroomAttendance/constants';
import AttendanceHeader from './ClassroomAttendance/components/AttendanceHeader';
import HolidayView from './ClassroomAttendance/components/HolidayView';
import AttendanceCheckView from './ClassroomAttendance/components/AttendanceCheckView';

const HOMEROOM_SUBJECT_CODE = 'HOMEROOM';

type HomeroomPhoto = {
    id: string;
    url: string;
    storagePath?: string;
    capturedAt?: any;
    uploadedAt?: any;
};

type PendingHomeroomPhoto = {
    id: string;
    previewUrl: string;
    blob: Blob;
    capturedAt: Date;
};

const HomeroomAttendancePage: React.FC = () => {
    const navigate = useNavigate();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedClass, setSelectedClass] = useState<CourseSchedule | null>(null);
    const [students, setStudents] = useState<Student[]>([]);
    const [attendance, setAttendance] = useState<Record<string, 'present' | 'absent' | 'late' | 'leave'>>({});
    const [studentLeaves, setStudentLeaves] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(true);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isHoliday, setIsHoliday] = useState(false);
    const [holidayName, setHolidayName] = useState('');
    const [scheduleDayOverride, setScheduleDayOverride] = useState<string | null>(null);
    const [academicYear, setAcademicYear] = useState<string>(String(getCurrentThaiYear()));
    const [semester, setSemester] = useState<string>('');
    const [homeroomTopic, setHomeroomTopic] = useState('');
    const [homeroomNote, setHomeroomNote] = useState('');
    const [homeroomPhotos, setHomeroomPhotos] = useState<HomeroomPhoto[]>([]);
    const [pendingPhotos, setPendingPhotos] = useState<PendingHomeroomPhoto[]>([]);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState('');
    const [isUploadingPhotos, setIsUploadingPhotos] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const cameraStreamRef = useRef<MediaStream | null>(null);
    const pendingPhotosRef = useRef<PendingHomeroomPhoto[]>([]);

    const dispatch = useDispatch();
    const currentUser = useSelector((state: RootState) => state.auth.user);
    const schoolId = (currentUser as any)?.schoolId;
    const { teachers: teacherMap, status: teacherMapStatus } = useSelector((state: RootState) => state.userMap);
    const calendarState = useSelector((state: RootState) => state.calendar);

    useEffect(() => {
        cameraStreamRef.current = cameraStream;
    }, [cameraStream]);

    useEffect(() => {
        pendingPhotosRef.current = pendingPhotos;
    }, [pendingPhotos]);

    useEffect(() => {
        return () => {
            cameraStreamRef.current?.getTracks().forEach(track => track.stop());
            pendingPhotosRef.current.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
        };
    }, []);

    useEffect(() => {
        if (videoRef.current && cameraStream) {
            videoRef.current.srcObject = cameraStream;
        }
    }, [cameraStream, isCameraOpen]);

    const currentTeacher = useMemo(() => {
        const teachersArr = Object.values(teacherMap || {}) as any[];
        return teachersArr.find((t: any) => t.uid === (currentUser as any)?.uid || t.id === (currentUser as any)?.uid);
    }, [teacherMap, currentUser]);

    useEffect(() => {
        if (schoolId && teacherMapStatus === 'idle') {
            dispatch(fetchTeachersMap(schoolId) as any);
        }
    }, [schoolId, teacherMapStatus, dispatch]);

    useEffect(() => {
        if (schoolId && calendarState.status === 'idle') {
            dispatch(fetchCalendar(schoolId) as any);
        }
    }, [schoolId, calendarState.status, dispatch]);

    useEffect(() => {
        if (calendarState.status === 'succeeded') {
            setAcademicYear(calendarState.academicYear || String(getCurrentThaiYear()));
        }
    }, [calendarState.status, calendarState.academicYear]);

    useEffect(() => {
        if (!schoolId) return;
        setIsHoliday(false);
        setHolidayName('');
        setScheduleDayOverride(null);

        const dateStr = toIsoDate(currentDate);
        if (calendarState.status === 'succeeded') {
            const events = calendarState.rawData?.events || {};
            const event = events[dateStr];
            const currentTerm = calendarState.terms.find(t => t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate) || calendarState.terms[0];
            setSemester(currentTerm?.id === 'term2' ? '2' : '1');

            if (event?.type === 'schoolDay') {
                if (event.scheduleDay) setScheduleDayOverride(event.scheduleDay);
                return;
            }

            const isWithinTerm = calendarState.terms.some(t => t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate);
            if (!isWithinTerm) {
                setIsHoliday(true);
                setHolidayName('อยู่นอกภาคเรียน (ไม่อยู่ในช่วงวันเรียน 100 วัน)');
            }

            const dayOfWeek = currentDate.getDay();
            if ((dayOfWeek === 0 || dayOfWeek === 6) && !isHoliday) {
                setIsHoliday(true);
                setHolidayName(dayOfWeek === 0 ? 'วันอาทิตย์' : 'วันเสาร์');
            }

            if (event?.type === 'holiday' || event?.type === 'specialHoliday') {
                setIsHoliday(true);
                setHolidayName(event.description || 'วันหยุดโรงเรียน');
            }
        }
    }, [currentDate, schoolId, calendarState.status, calendarState.rawData, calendarState.terms]);

    useEffect(() => {
        const checkGoogleHoliday = async () => {
            if (!schoolId || isHoliday) return;
            const dateStr = toIsoDate(currentDate);
            const apiKey = import.meta.env.VITE_GOOGLE_CALENDAR_API_KEY;
            if (!apiKey) return;

            try {
                const calendarId = 'th.th#holiday@group.v.calendar.google.com';
                const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?key=${apiKey}&timeMin=${dateStr}T00:00:00Z&timeMax=${dateStr}T23:59:59Z&singleEvents=true`);
                if (!response.ok) return;

                const data = await response.json();
                const summary = data.items?.[0]?.summary;
                if (summary && !isNonOfficialHoliday(summary)) {
                    setIsHoliday(true);
                    setHolidayName(summary);
                }
            } catch (error) {
                console.error('Error fetching Google Calendar API:', error);
            }
        };

        checkGoogleHoliday();
    }, [currentDate, schoolId, isHoliday]);

    useEffect(() => {
        setLoading(true);
        setSelectedClass(null);

        if (!currentTeacher) {
            setLoading(false);
            return;
        }

        const homeroomGrade = String((currentTeacher as any).homeroomGrade || '').trim();
        const homeroomRoom = String(
            (currentTeacher as any).homeroomRoom ||
            (homeroomGrade.includes('/') ? homeroomGrade.split('/')[1]?.trim() : '') ||
            ''
        ).trim();
        const gradeOnly = homeroomGrade.includes('/') ? homeroomGrade.split('/')[0]?.trim() : homeroomGrade;
        const classKey = Object.keys(CLASSES).find(key => key === gradeOnly || CLASSES[key] === gradeOnly) || gradeOnly;
        const className = CLASSES[classKey] || classKey || '';
        const dayKey = scheduleDayOverride || DAYS[currentDate.getDay()];

        if (classKey && className) {
            setSelectedClass({
                id: `homeroom-${classKey}-${homeroomRoom || 'all'}`,
                courseId: 'homeroom',
                subjectCode: HOMEROOM_SUBJECT_CODE,
                subjectName: 'เช็คชื่อโฮมรูม',
                period: 0,
                startTime: '08:30',
                endTime: '08:40',
                classId: classKey,
                className,
                room: homeroomRoom,
                day: dayKey,
                isChecked: false,
            });
        }

        setLoading(false);
    }, [currentTeacher, currentDate, scheduleDayOverride]);

    useEffect(() => {
        const fetchStudents = async () => {
            if (!schoolId || !selectedClass) return;
            setStudentsLoading(true);
            setIsSubmitted(false);

            try {
                const studentsRef = collection(db, 'school-settings', schoolId, 'students');
                const room = selectedClass.room && selectedClass.room !== 'all' ? String(selectedClass.room) : '';
                const studentQuery = room
                    ? query(studentsRef, where('classLevel', '==', selectedClass.className), where('room', '==', room))
                    : query(studentsRef, where('classLevel', '==', selectedClass.className));
                const snapshot = await getDocs(studentQuery);
                const studentList = snapshot.docs.map(studentDoc => {
                    const data = studentDoc.data() as any;
                    return {
                        id: studentDoc.id,
                        ...data,
                        number: data.studentNumber || data.number || '',
                        studentId: data.studentId || '',
                        studentNumber: data.studentId || '',
                        prefix: data.title || data.prefix || '',
                        nickname: data.nickname || '',
                    } as Student;
                }).sort((a, b) => (parseInt(a.number || '0', 10) || 0) - (parseInt(b.number || '0', 10) || 0));

                setStudents(studentList);

                const initialAttendance: Record<string, 'present' | 'absent' | 'late' | 'leave'> = {};
                const initialLeaves: Record<string, boolean> = {};
                studentList.forEach(student => initialAttendance[student.id] = 'present');

                const todayStr = toIsoDate(currentDate);
                const leaveResults = await Promise.all(studentList.map(async (student) => {
                    try {
                        const leaveQ = query(collection(db, 'school-settings', schoolId, 'students', student.id, 'leave_summary'), where('status', '==', 'approved'));
                        const leaveSnap = await getDocs(leaveQ);
                        const validLeave = leaveSnap.docs.find(leaveDoc => {
                            const data = leaveDoc.data();
                            const start = normalizeDateValue(data.startDate);
                            const end = normalizeDateValue(data.endDate);
                            return start && end && start <= todayStr && end >= todayStr;
                        });
                        if (validLeave) return { id: student.id, leaveType: validLeave.data().leaveType };
                    } catch (error) {
                        console.error('Error checking homeroom leave:', error);
                    }
                    return null;
                }));

                leaveResults.forEach(result => {
                    if (!result) return;
                    initialAttendance[result.id] = result.leaveType === 'ไปราชการ/กิจกรรม' ? 'present' : 'leave';
                    initialLeaves[result.id] = true;
                });

                setAttendance(initialAttendance);
                setStudentLeaves(initialLeaves);

                const dateId = toThaiDateId(currentDate);
                const attendanceId = `${dateId}_${HOMEROOM_SUBJECT_CODE}_${selectedClass.classId}_P0`;
                const existingResults = await Promise.all(studentList.map(async (student) => {
                    const attendanceRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
                    const attendanceSnap = await getDoc(attendanceRef);
                    return attendanceSnap.exists() ? { id: student.id, status: attendanceSnap.data().status } : null;
                }));

                const loadedAttendance = { ...initialAttendance };
                let hasRecord = false;
                existingResults.forEach(result => {
                    if (!result) return;
                    loadedAttendance[result.id] = initialLeaves[result.id] ? 'leave' : result.status;
                    hasRecord = true;
                });
                setAttendance(loadedAttendance);

                const dailyRef = doc(db, 'school-settings', schoolId, 'homeroom-attendance', `${dateId}_${selectedClass.classId}_${room || 'all'}`);
                const dailySnap = await getDoc(dailyRef);
                if (dailySnap.exists()) {
                    const data = dailySnap.data();
                    setHomeroomTopic(data.topic || '');
                    setHomeroomNote(data.note || '');
                    setHomeroomPhotos(Array.isArray(data.photos) ? data.photos : []);
                } else {
                    setHomeroomTopic('');
                    setHomeroomNote('');
                    setHomeroomPhotos([]);
                }
                setPendingPhotos(prev => {
                    prev.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
                    return [];
                });

                if (hasRecord) {
                    setIsSubmitted(true);
                    Swal.fire({ icon: 'info', title: 'มีการบันทึกแล้ว', text: 'สามารถกดปุ่ม "แก้ไข" เพื่อเปลี่ยนแปลงข้อมูลได้', timer: 1500, showConfirmButton: false });
                }
            } catch (error) {
                console.error('Error fetching homeroom students:', error);
            } finally {
                setStudentsLoading(false);
            }
        };

        fetchStudents();
    }, [selectedClass, schoolId, currentDate, academicYear, semester]);

    const handleSaveAttendance = async () => {
        if (!schoolId || !selectedClass) return;

        try {
            setIsUploadingPhotos(true);
            const dateId = toThaiDateId(currentDate);
            const normalizedDateObj = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate(), 12, 0, 0);
            const attendanceId = `${dateId}_${HOMEROOM_SUBJECT_CODE}_${selectedClass.classId}_P0`;
            const roomKey = selectedClass.room && selectedClass.room !== 'all' ? String(selectedClass.room) : '';
            const uploadedPhotos = await uploadPendingPhotos(dateId, roomKey);
            const savedPhotos = [...homeroomPhotos, ...uploadedPhotos];
            const batch = writeBatch(db);

            students.forEach(student => {
                const studentRef = doc(db, 'school-settings', schoolId, 'students', student.id, 'ClassroomAttendance', attendanceId);
                batch.set(studentRef, {
                    schoolId,
                    studentId: student.id,
                    date: Timestamp.fromDate(normalizedDateObj),
                    classId: selectedClass.classId,
                    className: selectedClass.className,
                    room: selectedClass.room || null,
                    period: 0,
                    subjectName: selectedClass.subjectName,
                    subjectCode: HOMEROOM_SUBJECT_CODE,
                    courseId: 'homeroom',
                    teacherId: (currentTeacher as any)?.id || (currentUser as any)?.uid || 'unknown',
                    teacherName: (currentTeacher as any)?.name || (currentUser as any)?.displayName || '',
                    status: attendance[student.id] || 'present',
                    academicYear,
                    semester,
                    homeroomTopic,
                    homeroomNote,
                    attendanceType: 'homeroom',
                    updatedAt: Timestamp.now(),
                }, { merge: true });
            });

            const dailyRef = doc(db, 'school-settings', schoolId, 'homeroom-attendance', `${dateId}_${selectedClass.classId}_${roomKey || 'all'}`);
            batch.set(dailyRef, {
                schoolId,
                date: Timestamp.fromDate(normalizedDateObj),
                classId: selectedClass.classId,
                className: selectedClass.className,
                room: selectedClass.room || null,
                teacherId: (currentTeacher as any)?.id || (currentUser as any)?.uid || 'unknown',
                teacherName: (currentTeacher as any)?.name || (currentUser as any)?.displayName || '',
                topic: homeroomTopic,
                note: homeroomNote,
                photos: savedPhotos,
                academicYear,
                semester,
                updatedAt: Timestamp.now(),
            }, { merge: true });

            await batch.commit();
            pendingPhotos.forEach(photo => URL.revokeObjectURL(photo.previewUrl));
            setPendingPhotos([]);
            setHomeroomPhotos(savedPhotos);
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกการเช็คชื่อโฮมรูมเรียบร้อยแล้ว', timer: 1500, showConfirmButton: false });
            setIsSubmitted(true);
        } catch (error) {
            console.error('Error saving homeroom attendance:', error);
            Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกข้อมูลโฮมรูมได้', 'error');
        } finally {
            setIsUploadingPhotos(false);
        }
    };

    const uploadPendingPhotos = async (dateId: string, roomKey: string): Promise<HomeroomPhoto[]> => {
        if (!schoolId || !selectedClass || pendingPhotos.length === 0) return [];

        return Promise.all(pendingPhotos.map(async (photo, index) => {
            const storagePath = [
                'school-settings',
                schoolId,
                'homeroom-activities',
                academicYear || 'unknown-year',
                dateId,
                `${selectedClass.classId}_${roomKey || 'all'}_${Date.now()}_${index + 1}.jpg`,
            ].join('/');
            const imageRef = ref(storage, storagePath);
            const snapshot = await uploadBytes(imageRef, photo.blob, { contentType: 'image/jpeg' });
            const url = await getDownloadURL(snapshot.ref);
            return {
                id: photo.id,
                url,
                storagePath,
                capturedAt: Timestamp.fromDate(photo.capturedAt),
                uploadedAt: Timestamp.now(),
            };
        }));
    };

    const openCamera = async () => {
        if (isSubmitted) return;
        setCameraError('');

        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError('อุปกรณ์นี้ไม่รองรับการเปิดกล้องผ่านเบราว์เซอร์');
            setIsCameraOpen(true);
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            setCameraStream(stream);
            setIsCameraOpen(true);
        } catch (error) {
            console.error('Error opening homeroom camera:', error);
            setCameraError('ไม่สามารถเปิดกล้องได้ กรุณาอนุญาตการใช้งานกล้องในเบราว์เซอร์');
            setIsCameraOpen(true);
        }
    };

    const closeCamera = () => {
        cameraStream?.getTracks().forEach(track => track.stop());
        setCameraStream(null);
        setIsCameraOpen(false);
        setCameraError('');
    };

    const capturePhoto = async () => {
        if (!videoRef.current) return;
        const video = videoRef.current;
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) {
            setCameraError('กล้องยังไม่พร้อม กรุณารอสักครู่แล้วลองถ่ายอีกครั้ง');
            return;
        }

        const canvas = document.createElement('canvas');
        const maxWidth = 1280;
        const ratio = Math.min(1, maxWidth / width);
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
        if (!blob) {
            setCameraError('ไม่สามารถบีบอัดภาพเป็น JPG ได้');
            return;
        }

        const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        setPendingPhotos(prev => [
            ...prev,
            {
                id,
                blob,
                previewUrl: URL.createObjectURL(blob),
                capturedAt: new Date(),
            },
        ]);
        closeCamera();
    };

    const removePendingPhoto = (photoId: string) => {
        setPendingPhotos(prev => {
            const target = prev.find(photo => photo.id === photoId);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter(photo => photo.id !== photoId);
        });
    };

    const removeSavedPhoto = (photoId: string) => {
        if (isSubmitted) return;
        setHomeroomPhotos(prev => prev.filter(photo => photo.id !== photoId));
    };

    const toggleStatus = (studentId: string, status: 'present' | 'absent' | 'late' | 'leave') => {
        if (isSubmitted || isHoliday || studentLeaves[studentId]) return;
        setAttendance(prev => ({ ...prev, [studentId]: status }));
    };

    const attendanceSummary = useMemo(() => {
        return students.reduce((acc, student) => {
            const status = attendance[student.id] || 'present';
            const key = status === 'present' ? 'มา' : status === 'late' ? 'สาย' : status === 'leave' ? 'ลา' : 'ขาด';
            acc[key as keyof typeof acc]++;
            return acc;
        }, { มา: 0, สาย: 0, ลา: 0, ขาด: 0 });
    }, [students, attendance]);

    return (
        <MainLayout>
            <div className="p-4 sm:p-6 text-gray-900 dark:text-white transition-colors duration-300 min-h-screen">
                <div className="max-w-5xl mx-auto">
                    <BackButton to="/academic/hub/attendance" className="mb-4" />
                    <AttendanceHeader
                        teacherName={(currentTeacher as any)?.name || ''}
                        currentDate={currentDate}
                        academicYear={academicYear}
                        semester={semester}
                        onDateChange={setCurrentDate}
                        title="ระบบเช็คชื่อโฮมรูม"
                    />

                    {isHoliday ? (
                        <HolidayView holidayName={holidayName} />
                    ) : loading ? (
                        <div className="text-center py-12 text-gray-500">กำลังโหลดข้อมูลโฮมรูม...</div>
                    ) : !selectedClass ? (
                        <div className="rounded-3xl border border-dashed border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-8 text-center">
                            <Home className="mx-auto mb-4 text-amber-500" size={42} />
                            <h2 className="text-lg font-black text-gray-900 dark:text-white">ยังไม่ได้กำหนดชั้นโฮมรูม</h2>
                            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                                กรุณากำหนดชั้น/ห้องประจำให้ครูคนนี้ในข้อมูลครูก่อนใช้งานระบบเช็คชื่อโฮมรูม
                            </p>
                        </div>
                    ) : (
                        <AttendanceCheckView
                            selectedClass={selectedClass}
                            students={students}
                            attendance={attendance}
                            studentLeaves={studentLeaves}
                            isSubmitted={isSubmitted}
                            isHoliday={isHoliday}
                            studentsLoading={studentsLoading}
                            schoolId={schoolId || ''}
                            onBack={() => navigate('/academic/hub/attendance')}
                            onEdit={() => setIsSubmitted(false)}
                            onSave={handleSaveAttendance}
                            onToggleStatus={toggleStatus}
                            attendanceSummary={attendanceSummary}
                        >
                            <section className="rounded-2xl sm:rounded-3xl bg-white dark:bg-[#26272b] border border-gray-100 dark:border-white/5 shadow-sm overflow-hidden">
                                <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5 border-b border-gray-100 dark:border-white/5">
                                    <div className="min-w-0">
                                        <h3 className="flex items-center gap-2 text-sm sm:text-base font-black text-gray-900 dark:text-white">
                                            <MessageSquareText size={18} className="text-indigo-500 shrink-0" />
                                            บันทึกกิจกรรมโฮมรูม
                                        </h3>
                                        <p className="mt-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400 truncate">
                                            หัวข้อ หมายเหตุ และภาพกิจกรรมของวันนี้
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={openCamera}
                                        disabled={isSubmitted || isUploadingPhotos}
                                        className="shrink-0 inline-flex items-center justify-center gap-2 h-10 sm:h-11 px-3 sm:px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-white/10 dark:disabled:text-gray-500 text-white text-xs sm:text-sm font-black transition active:scale-95"
                                    >
                                        <Camera size={17} />
                                        <span>ถ่ายภาพ</span>
                                    </button>
                                </div>

                                <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
                                    <div className="space-y-3">
                                        <div>
                                            <label className="flex items-center gap-2 text-[11px] sm:text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                                                <MessageSquareText size={14} /> หัวข้อโฮมรูมวันนี้
                                            </label>
                                            <input
                                                value={homeroomTopic}
                                                onChange={(e) => setHomeroomTopic(e.target.value)}
                                                disabled={isSubmitted}
                                                placeholder="เช่น วินัยการมาเรียน / การเตรียมสอบ / แนะแนว"
                                                className="w-full h-12 px-4 rounded-xl bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 text-sm sm:text-base text-gray-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-60"
                                            />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 text-[11px] sm:text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-2">
                                                <ImagePlus size={14} /> หมายเหตุเพิ่มเติม
                                            </label>
                                            <textarea
                                                value={homeroomNote}
                                                onChange={(e) => setHomeroomNote(e.target.value)}
                                                disabled={isSubmitted}
                                                placeholder="บันทึกสิ่งที่พูดคุย ปัญหาที่พบ หรือประเด็นติดตามต่อ"
                                                rows={3}
                                                className="w-full min-h-[104px] px-4 py-3 rounded-xl bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 text-sm sm:text-base text-gray-900 dark:text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/15 disabled:opacity-60 resize-none"
                                            />
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-gray-50 dark:bg-[#1e1f21] border border-gray-100 dark:border-white/5 p-3 sm:p-4 min-w-0">
                                        <div className="flex items-center justify-between gap-2">
                                            <label className="flex items-center gap-2 text-[11px] sm:text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                                <Camera size={14} /> ภาพกิจกรรม
                                            </label>
                                        </div>

                                        {homeroomPhotos.length === 0 && pendingPhotos.length === 0 ? (
                                            <button
                                                type="button"
                                                onClick={openCamera}
                                                disabled={isSubmitted || isUploadingPhotos}
                                                className="mt-3 flex min-h-[132px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-white/[0.03] text-gray-500 dark:text-gray-400 disabled:opacity-60"
                                            >
                                                <Camera size={26} className="text-indigo-500" />
                                                <span className="text-sm font-black text-gray-700 dark:text-gray-200">เพิ่มภาพกิจกรรม</span>
                                                <span className="px-4 text-center text-[11px] leading-5">ภาพจะถูกบีบอัดก่อนบันทึก</span>
                                            </button>
                                        ) : (
                                            <div className="mt-3 -mx-1 flex gap-3 overflow-x-auto px-1 pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible">
                                                {homeroomPhotos.map(photo => (
                                                    <div key={photo.id} className="relative h-28 w-36 shrink-0 overflow-hidden rounded-xl border border-gray-200 dark:border-white/10 bg-gray-100 dark:bg-[#1e1f21] lg:h-auto lg:w-auto lg:aspect-[4/3]">
                                                        <img src={photo.url} alt="ภาพกิจกรรมโฮมรูม" className="w-full h-full object-cover" />
                                                        {!isSubmitted && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removeSavedPhoto(photo.id)}
                                                                className="absolute top-2 right-2 w-8 h-8 inline-flex items-center justify-center rounded-lg bg-black/60 text-white hover:bg-red-600 transition"
                                                                aria-label="ลบภาพ"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {pendingPhotos.map(photo => (
                                                    <div key={photo.id} className="relative h-28 w-36 shrink-0 overflow-hidden rounded-xl border border-indigo-300 dark:border-indigo-500/40 bg-gray-100 dark:bg-[#1e1f21] lg:h-auto lg:w-auto lg:aspect-[4/3]">
                                                        <img src={photo.previewUrl} alt="ภาพกิจกรรมที่รอบันทึก" className="w-full h-full object-cover" />
                                                        <div className="absolute left-2 bottom-2 rounded-lg bg-indigo-600 px-2 py-1 text-[10px] font-black text-white">รอบันทึก</div>
                                                        {!isSubmitted && (
                                                            <button
                                                                type="button"
                                                                onClick={() => removePendingPhoto(photo.id)}
                                                                className="absolute top-2 right-2 w-8 h-8 inline-flex items-center justify-center rounded-lg bg-black/60 text-white hover:bg-red-600 transition"
                                                                aria-label="ลบภาพ"
                                                            >
                                                                <Trash2 size={15} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                {!isSubmitted && (
                                                    <button
                                                        type="button"
                                                        onClick={openCamera}
                                                        disabled={isUploadingPhotos}
                                                        className="h-28 w-24 shrink-0 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-500/40 bg-white/70 dark:bg-white/[0.03] text-indigo-600 dark:text-indigo-300 inline-flex flex-col items-center justify-center gap-1 text-xs font-black disabled:opacity-60 lg:h-auto lg:w-auto lg:aspect-[4/3]"
                                                    >
                                                        <Camera size={20} />
                                                        เพิ่ม
                                                    </button>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </section>
                        </AttendanceCheckView>
                    )}
                </div>
            </div>
            {isCameraOpen && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-[#1f2024] border border-white/10 overflow-hidden shadow-2xl">
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 dark:border-white/10">
                            <div>
                                <h3 className="text-lg font-black text-gray-900 dark:text-white">ถ่ายภาพกิจกรรมโฮมรูม</h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400">ระบบจะขออนุญาตใช้กล้องจากอุปกรณ์ก่อนเปิดใช้งาน</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeCamera}
                                className="w-10 h-10 inline-flex items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-white/15 transition"
                                aria-label="ปิดกล้อง"
                            >
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-4">
                            {cameraError ? (
                                <div className="min-h-[260px] rounded-2xl border border-dashed border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center text-center p-6">
                                    <div>
                                        <Camera className="mx-auto mb-3 text-amber-500" size={42} />
                                        <p className="font-bold text-gray-800 dark:text-gray-100">{cameraError}</p>
                                    </div>
                                </div>
                            ) : (
                                <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full max-h-[70vh] rounded-2xl bg-black object-contain"
                                />
                            )}
                        </div>
                        <div className="flex justify-end gap-3 p-4 border-t border-gray-100 dark:border-white/10">
                            <button
                                type="button"
                                onClick={closeCamera}
                                className="h-11 px-5 rounded-xl bg-gray-100 dark:bg-white/10 text-gray-700 dark:text-gray-200 font-black hover:bg-gray-200 dark:hover:bg-white/15 transition"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={capturePhoto}
                                disabled={!cameraStream || !!cameraError}
                                className="h-11 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-300 disabled:text-gray-500 dark:disabled:bg-white/10 dark:disabled:text-gray-500 text-white font-black transition inline-flex items-center gap-2"
                            >
                                <Camera size={17} />
                                ถ่ายภาพ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </MainLayout>
    );
};

const toIsoDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const toThaiDateId = (date: Date) => {
    const year = date.getFullYear();
    return `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${year}`;
};

const normalizeDateValue = (value: any) => {
    if (value?.toDate) return value.toDate().toISOString().split('T')[0];
    if (typeof value === 'string') return value;
    return '';
};

export default HomeroomAttendancePage;
