import React, { useState, useEffect, useCallback } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { firestore, storage } from '../../firebase';
import { collection, doc, getDoc, getDocs, query, where, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, deleteObject, getDownloadURL } from 'firebase/storage';
import MainLayout from "@/layouts/MainLayout";
import {
    FaCloudUploadAlt,
    FaImages,
    FaTrash,
    FaCheckCircle,
    FaTimesCircle,
    FaInfoCircle,
    FaSchool,
    FaChalkboardTeacher,
    FaLayerGroup
} from 'react-icons/fa';
import Swal from 'sweetalert2';
import { useDropzone } from 'react-dropzone';
import { compressImage } from "@/utils/imageUtils";
import { getLevelsByRange } from "@/utils/schoolUtils";


const BulkUploadStudentImagesPage: React.FC = () => {
    const { user } = useSelector((state: RootState) => state.auth);
    const schoolId = user?.schoolId;

    const [classLevel, setClassLevel] = useState("");
    const [room, setRoom] = useState("");

    // Student Tracking State
    interface StudentInfo {
        id: string;
        studentId: string;
        firstName: string;
        lastName: string;
        profileImageUrl?: string;
    }
    const [studentsInGroup, setStudentsInGroup] = useState<StudentInfo[]>([]);
    const [loadingStudents, setLoadingStudents] = useState(false);

    // School Config
    const [, setSchoolType] = useState("");
    const [availableLevels, setAvailableLevels] = useState<string[]>([]);

    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: 'pending' | 'uploading' | 'success' | 'error' }>({});

    // Fetch School Config (SchoolType, Levels)
    useEffect(() => {
        if (!schoolId) return;

        const fetchSchoolInfo = async () => {
            try {
                const schoolDoc = await getDoc(doc(firestore, 'school-settings', schoolId));
                if (schoolDoc.exists()) {
                    const data = schoolDoc.data();
                    setSchoolType(data.schoolType || "");

                    const levels = getLevelsByRange(data.opportunityExpansionLevel || "");
                    setAvailableLevels(levels);

                }
            } catch (error) {
                console.error("Error fetching school info:", error);
            }
        };

        fetchSchoolInfo();
    }, [schoolId]);

    // Fetch Students in selected Group
    useEffect(() => {
        if (!schoolId || !classLevel || !room) {
            setStudentsInGroup([]);
            return;
        }

        const fetchStudents = async () => {
            setLoadingStudents(true);
            try {
                const studentsRef = collection(firestore, "school-settings", schoolId, "students");
                let q;

                q = query(
                    studentsRef,
                    where("classLevel", "==", classLevel),
                    where("room", "==", room)
                );
                const snapshot = await getDocs(q);
                const list = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                } as StudentInfo));
                setStudentsInGroup(list);
            } catch (error) {
                console.error("Error fetching students:", error);
                setStudentsInGroup([]);
            } finally {
                setLoadingStudents(false);
            }
        };

        fetchStudents();
    }, [schoolId, classLevel, room]);

    const onDrop = useCallback((acceptedFiles: File[]) => {
        const validFiles: File[] = [];
        const invalidFiles: string[] = [];

        acceptedFiles.forEach(file => {
            const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            // Filter only images AND filenames must be numeric only
            if (file.type.startsWith('image/') && /^\d+$/.test(nameWithoutExt)) {
                validFiles.push(file);
            } else {
                invalidFiles.push(file.name);
            }
        });

        if (invalidFiles.length > 0) {
            Swal.fire({
                icon: 'error',
                title: 'พบไฟล์ชื่อไม่ถูกต้อง',
                text: `ระบบจะกรองไฟล์ที่ชื่อไม่ใช่ตัวเลขออก: ${invalidFiles.join(', ')}`,
                confirmButtonColor: '#4f46e5'
            });
        }

        setFiles(prev => [...prev, ...validFiles]);

        // Initialize progress state for valid files
        const newProgress = { ...uploadProgress };
        validFiles.forEach(file => {
            newProgress[file.name] = 'pending';
        });
        setUploadProgress(newProgress);
    }, [uploadProgress]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/jpeg': ['.jpg', '.jpeg'],
            'image/png': ['.png'],
            'image/webp': ['.webp']
        }
    });

    const removeFile = (fileName: string) => {
        setFiles(prev => prev.filter(f => f.name !== fileName));
        const newProgress = { ...uploadProgress };
        delete newProgress[fileName];
        setUploadProgress(newProgress);
    };

    const handleUpload = async () => {
        // Validation
        if (!classLevel) {
            Swal.fire('กรุณาระบุข้อมูล', 'กรุณาเลือกระดับชั้น', 'warning');
            return;
        }

        if (!room) {
            Swal.fire('กรุณาระบุข้อมูล', 'กรุณาเลือกห้องเรียน', 'warning');
            return;
        }

        setUploading(true);
        const results: { fileName: string; studentId: string; status: 'success' | 'error'; error?: string }[] = [];

        // Identify files to process (skip already successful ones)
        const filesToUpload = files.filter(f => uploadProgress[f.name] !== 'success');

        for (const file of filesToUpload) {
            setUploadProgress(prev => ({ ...prev, [file.name]: 'uploading' }));
            // Assumes filename is ID (e.g. 12345.jpg -> 12345)
            let studentId = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
            // 💡 Padding Student ID: ถ้าเป็น 4 หลัก ให้เติม 0 ข้างหน้า เพื่อให้สอดคล้องกับระบบ DMC
            if (studentId.length === 4) {
                studentId = `0${studentId}`;
            }

            // Validate Student ID (Numbers only)
            if (!/^\d+$/.test(studentId)) {
                setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }));
                results.push({
                    fileName: file.name,
                    studentId,
                    status: 'error',
                    error: 'ชื่อไฟล์ต้องเป็นตัวเลขเท่านั้น'
                });
                continue;
            }

            try {
                // 1. Query Student
                const studentsRef = collection(firestore, "school-settings", schoolId!, "students");
                const q = query(studentsRef, where("studentId", "==", studentId));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    throw new Error(`ไม่พบข้อมูลนักเรียนรหัส ${studentId}`);
                }

                const studentDoc = querySnapshot.docs[0];
                const studentData = studentDoc.data();
                const studentDocId = studentDoc.id;

                // 2. Space Efficiency: Delete Old Image if exists (Before uploading new one)
                // We check studentData from the first query or from studentsInGroup
                if (studentData.profileImageUrl && (studentData.profileImageUrl.includes('firebasestorage') || studentData.profileImageUrl.includes('googleap'))) {
                    try {
                        // Extract path from URL to be more precise for deletion
                        const oldImageRef = ref(storage, studentData.profileImageUrl);
                        await deleteObject(oldImageRef);
                        console.log(`Deleted old image for student ${studentId}`);
                    } catch (err: any) {
                        // Ignore 404/not found errors as the goal is simply to ensure it's gone
                        if (err.code !== 'storage/object-not-found') {
                            console.warn(`Failed to delete old image for ${studentId}`, err);
                        }
                    }
                }

                // 3. Upload New Image
                const compressedFile = await compressImage(file, 800, 0.8, 'image/webp');

                // Construct Path
                const storagePath = `school-settings/${schoolId}/students/${studentData.classLevel}/${studentData.room || "unknown"}`;
                const newFileName = `${studentId}.webp`;
                const finalRef = ref(storage, `${storagePath}/${newFileName}`);

                await uploadBytes(finalRef, compressedFile);
                const downloadURL = await getDownloadURL(finalRef);

                // 4. Update Firestore
                await updateDoc(doc(firestore, "school-settings", schoolId!, "students", studentDocId), {
                    profileImageUrl: downloadURL,
                    updatedAt: serverTimestamp()
                });

                // Update local state to reflect change immediately in UI summary
                setStudentsInGroup(prev => prev.map(s =>
                    s.studentId === studentId ? { ...s, profileImageUrl: downloadURL } : s
                ));

                setUploadProgress(prev => ({ ...prev, [file.name]: 'success' }));
                results.push({ fileName: file.name, studentId, status: 'success' });

            } catch (error: any) {
                console.error(`Error uploading ${file.name}:`, error);
                setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }));
                results.push({
                    fileName: file.name,
                    studentId,
                    status: 'error',
                    error: error.message || 'Upload failed'
                });
            }
        }

        setUploading(false);

        // Show Summary
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;

        if (results.length > 0) {
            if (errorCount === 0) {
                const updateCount = results.filter(r => {
                    const student = studentsInGroup.find(s => s.studentId === r.studentId);
                    return student && student.profileImageUrl;
                }).length;
                const newCount = successCount - updateCount;

                Swal.fire({
                    icon: 'success',
                    title: 'อัปโหลดเสร็จสิ้น',
                    html: `
                        <p>อัปโหลดสำเร็จทั้งหมด ${successCount} รายการ</p>
                        <div class="mt-2 text-sm text-gray-600 flex justify-center gap-4">
                            <span class="text-green-600 font-bold">เพิ่มใหม่: ${newCount}</span>
                            <span class="text-blue-600 font-bold">อัปเดต: ${updateCount}</span>
                        </div>
                    `,
                    timer: 3000,
                    showConfirmButton: false,
                    background: '#ffffff',
                    color: '#000000'
                });
                setFiles([]); // Clear valid files
            } else {
                Swal.fire({
                    icon: 'warning',
                    title: 'พบข้อผิดพลาดบางรายการ',
                    html: `
                        <div style="text-align: left;">
                            <p><b>สำเร็จ:</b> ${successCount} รายการ</p>
                            <p><b>ล้มเหลว:</b> ${errorCount} รายการ</p>
                            <hr style="margin: 10px 0;">
                            <div style="max-height: 150px; overflow-y: auto; font-size: 0.9em;">
                                ${results.filter(r => r.status === 'error').map(r => `<div style="color:red; margin-bottom: 4px;">• ${r.fileName}: ${r.error}</div>`).join('')}
                            </div>
                        </div>
                    `,
                });
            }
        }
    };

    // Calculate success count
    const successCount = Object.values(uploadProgress).filter(status => status === 'success').length;
    const errorCount = Object.values(uploadProgress).filter(status => status === 'error').length;

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-gray-900 font-sans pb-20">
                {/* Header Section */}
                <div className="bg-white dark:bg-[#1e1f21] border-b border-gray-200 dark:border-gray-800 sticky top-[60px] z-20 shadow-sm transition-all duration-300">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl hidden sm:block">
                                    <FaImages className="text-2xl text-indigo-600 dark:text-indigo-400" />
                                </div>
                                <div>
                                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                                        อัปโหลดรูปภาพนักเรียน
                                    </h1>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:block hidden">
                                        ระบบจัดการรูปภาพนักเรียนแบบ Bulk Upload
                                    </p>
                                </div>
                            </div>

                            {/* Actions or Steps */}
                            <div className="flex items-center gap-3">
                                {files.length > 0 ? (
                                    <>
                                        <div className="hidden sm:flex flex-col items-end mr-2">
                                            <span className="text-xs text-gray-500 dark:text-gray-400">เลือกแล้ว</span>
                                            <span className="font-bold text-indigo-600 dark:text-indigo-400">{files.length} รูป</span>
                                        </div>
                                        <button
                                            onClick={handleUpload}
                                            disabled={uploading}
                                            className={`
                                                py-2.5 px-6 text-white font-bold rounded-xl shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 flex items-center gap-2
                                                ${uploading
                                                    ? 'bg-gray-400 cursor-not-allowed opacity-70'
                                                    : 'bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700'
                                                }
                                            `}
                                        >
                                            {uploading ? (
                                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                            ) : (
                                                <FaCloudUploadAlt className="text-xl" />
                                            )}
                                            <span className="hidden sm:inline">{uploading ? 'กำลังอัปโหลด...' : 'ยืนยันการอัปโหลด'}</span>
                                            <span className="sm:hidden">อัปโหลด</span>
                                        </button>
                                    </>
                                ) : (
<<<<<<< HEAD
                                    <div className="items-center gap-6 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 py-2 px-4 rounded-lg border border-gray-100 dark:border-gray-700 hidden lg:flex">
=======
                                    <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 py-2 px-4 rounded-lg border border-gray-100 dark:border-gray-700 hidden lg:flex">
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold text-xs">1</span>
                                            <span>เลือกห้องเรียน</span>
                                        </div>
                                        <div className="w-8 h-[1px] bg-gray-300 dark:bg-gray-600"></div>
                                        <div className="flex items-center gap-2">
                                            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 font-bold text-xs">2</span>
                                            <span>เลือกรูปภาพ</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Progress Bar Overlay - Shows only when uploading */}
                        {uploading && (
                            <div className="mt-4 animate-fadeIn">
                                <div className="flex justify-between text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                                    <span>กำลังอัปโหลด... {Math.round((Object.values(uploadProgress).filter(s => s !== 'pending').length / files.length) * 100)}%</span>
                                    <span>{Object.values(uploadProgress).filter(s => s !== 'pending').length} / {files.length}</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                                    <div
                                        className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300 ease-out"
                                        style={{ width: `${(Object.values(uploadProgress).filter(s => s !== 'pending').length / files.length) * 100}%` }}
                                    ></div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                        {/* LEFT COLUMN: Settings & Guidelines */}
                        <div className="lg:col-span-4 space-y-6">
                            {/* Step 1: Configuration */}
                            <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">1</div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">ระบุข้อมูลห้องเรียน</h3>
                                </div>
                                <div className="p-6 space-y-5">
                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            <FaLayerGroup className="text-gray-400" />
                                            ระดับชั้น
                                        </label>
                                        <select
                                            value={classLevel}
                                            onChange={(e) => setClassLevel(e.target.value)}
                                            className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-gray-900 dark:text-white"
                                        >
                                            <option value="">-- กรุณาเลือกระดับชั้น --</option>
                                            {availableLevels.map(level => (
                                                <option key={level} value={level}>{level}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                            <FaChalkboardTeacher className="text-gray-400" />
                                            ห้องเรียน
                                        </label>
                                        <select
                                            value={room}
                                            onChange={(e) => setRoom(e.target.value)}
                                            className="w-full bg-white dark:bg-[#2a2b2f] border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-gray-900 dark:text-white"
                                        >
                                            <option value="">-- เลือกห้อง --</option>
                                            {Array.from({ length: 20 }, (_, i) => i + 1).map(r => (
                                                <option key={r} value={r}>{r}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Stats Dashboard */}
                            {classLevel && room && (
                                <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden animate-slideUp">
                                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex items-center justify-between">
                                        <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                            <FaInfoCircle className="text-indigo-500" />
                                            สรุปสถานะรูปภาพในห้อง
                                        </h3>
                                        <span className="text-xs font-medium px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full text-gray-500">
                                            {classLevel} ห้อง {room}
                                        </span>
                                    </div>
                                    <div className="p-5">
                                        {loadingStudents ? (
                                            <div className="flex flex-col items-center py-6">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-2"></div>
                                                <p className="text-sm text-gray-500">กำลังตรวจสอบข้อมูลนักเรียน...</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="p-4 bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-800/20 rounded-xl text-center">
                                                    <p className="text-xs text-green-700 dark:text-green-400 font-bold uppercase tracking-wider mb-1">มีรูปแล้ว</p>
                                                    <p className="text-2xl font-black text-green-600 dark:text-green-300">
                                                        {studentsInGroup.filter(s => s.profileImageUrl).length}
                                                        <span className="text-sm font-normal text-green-500 ml-1">คน</span>
                                                    </p>
                                                </div>
                                                <div className="p-4 bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-800/20 rounded-xl text-center">
                                                    <p className="text-xs text-orange-700 dark:text-orange-400 font-bold uppercase tracking-wider mb-1">ยังไม่มีรูป</p>
                                                    <p className="text-2xl font-black text-orange-600 dark:text-orange-300">
                                                        {studentsInGroup.filter(s => !s.profileImageUrl).length}
                                                        <span className="text-sm font-normal text-orange-500 ml-1">คน</span>
                                                    </p>
                                                </div>
                                                <div className="col-span-2 mt-2">
                                                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2 mb-2">
                                                        <div
                                                            className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                                                            style={{
                                                                width: `${studentsInGroup.length > 0 ? (studentsInGroup.filter(s => s.profileImageUrl).length / studentsInGroup.length) * 100 : 0}%`
                                                            }}
                                                        ></div>
                                                    </div>
                                                    <p className="text-[10px] text-center text-gray-500">
                                                        ทั้งหมด {studentsInGroup.length} คน | ความคืบหน้า {studentsInGroup.length > 0 ? Math.round((studentsInGroup.filter(s => s.profileImageUrl).length / studentsInGroup.length) * 100) : 0}%
                                                    </p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Guideline Card */}
                            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl p-6 border border-indigo-100 dark:border-indigo-800">
                                <div className="flex items-start gap-3">
                                    <FaInfoCircle className="text-indigo-600 dark:text-indigo-400 text-xl flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-indigo-900 dark:text-indigo-300 mb-2">คำแนะนำการตั้งชื่อไฟล์</h4>
                                        <p className="text-sm text-indigo-800 dark:text-indigo-200 leading-relaxed opacity-90">
                                            ระบบจะใช้ชื่อไฟล์เป็นรหัสประจำตัวนักเรียน
                                            <span className="block mt-1 font-bold text-red-600 dark:text-red-400">
                                                * ชื่อไฟล์ต้องเป็นตัวเลขล้วนเท่านั้น
                                            </span>
                                            <span className="block mt-1">
                                                * นามสกุลที่รองรับ: .jpg, .jpeg, .png, .webp
                                            </span>
                                        </p>
                                        <div className="mt-4 bg-white dark:bg-[#1e1f21] p-3 rounded-lg border border-indigo-100 dark:border-indigo-800 shadow-sm">
                                            <code className="text-sm font-mono text-gray-700 dark:text-gray-300">
                                                <span className="text-green-600 dark:text-green-400 font-bold">✓ 123456.jpg</span>
                                                <br />
                                                <span className="text-red-500 dark:text-red-400 font-bold">✗ mmP12234.jpg</span>
                                            </code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Upload Area */}
                        <div className="lg:col-span-8 space-y-6">
                            {/* Dropzone */}
                            <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                                <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold">2</div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">เลือกรูปภาพ</h3>
                                </div>

                                <div className="p-6">
                                    <div
                                        {...getRootProps()}
                                        className={`
                                            group border-2 border-dashed rounded-2xl p-10 
                                            flex flex-col items-center justify-center text-center cursor-pointer 
                                            transition-all duration-200 ease-in-out
                                            ${isDragActive
                                                ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 scale-[0.99]'
                                                : 'border-gray-300 dark:border-gray-700 hover:border-indigo-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                                            }
                                        `}
                                    >
                                        <input {...getInputProps()} />
                                        <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                            <FaCloudUploadAlt className="text-3xl" />
                                        </div>
                                        <p className="text-lg font-bold text-gray-700 dark:text-gray-200">
                                            ลากไฟล์รูปภาพมาวางที่นี่
                                        </p>
                                        <p className="text-gray-500 dark:text-gray-400 mt-2">
                                            หรือ <span className="text-indigo-600 dark:text-indigo-400 font-bold underline">คลิกเพื่อเลือกไฟล์</span>
                                        </p>
                                        <p className="text-xs text-gray-400 mt-4 uppercase tracking-wider">
                                            รองรับ JPG / JPEG / PNG / WEBP
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* File Preview Grid */}
                            {files.length > 0 && (
                                <div className="bg-white dark:bg-[#1e1f21] rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
                                    <div className="p-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/20 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 font-bold">3</div>
                                            <h3 className="font-bold text-gray-900 dark:text-white">รายการรูปภาพ ({files.length})</h3>
                                        </div>

                                        {(successCount > 0 || errorCount > 0) && (
                                            <div className="flex gap-3 text-xs font-bold">
                                                {successCount > 0 && <span className="text-green-600 bg-green-50 dark:bg-green-900/20 px-2 py-1 rounded">สำเร็จ {successCount}</span>}
                                                {errorCount > 0 && <span className="text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded">ผิดพลาด {errorCount}</span>}
                                            </div>
                                        )}

                                        <button
                                            onClick={() => setFiles([])}
                                            className="text-xs text-red-500 hover:text-red-700 font-medium px-3 py-1 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition"
                                            disabled={uploading}
                                        >
                                            ล้างทั้งหมด
                                        </button>
                                    </div>

                                    <div className="p-6">
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                                            {files.map((file, index) => (
                                                <div
                                                    key={index + file.name}
                                                    className={`
                                                        relative group rounded-xl border p-2 bg-gray-50 dark:bg-gray-800/50
                                                        ${uploadProgress[file.name] === 'success' ? 'border-green-400 bg-green-50 dark:bg-green-900/10' : ''}
                                                        ${uploadProgress[file.name] === 'error' ? 'border-red-400 bg-red-50 dark:bg-red-900/10' : ''}
                                                        ${!uploadProgress[file.name] ? 'border-gray-200 dark:border-gray-700' : ''}
                                                    `}
                                                >
                                                    <div className="aspect-square rounded-lg overflow-hidden bg-white dark:bg-gray-900 mb-2 relative">
                                                        <img
                                                            src={URL.createObjectURL(file)}
                                                            alt="preview"
                                                            className="w-full h-full object-cover"
                                                        />

                                                        {uploadProgress[file.name] === 'success' && (
                                                            <div className="absolute inset-0 bg-green-500/30 flex items-center justify-center">
                                                                <FaCheckCircle className="text-white text-3xl drop-shadow-md" />
                                                            </div>
                                                        )}

                                                        {uploadProgress[file.name] === 'error' && (
                                                            <div className="absolute inset-0 bg-red-500/30 flex items-center justify-center">
                                                                <FaTimesCircle className="text-white text-3xl drop-shadow-md" />
                                                            </div>
                                                        )}

                                                        {!uploadProgress[file.name] && !uploading && (
                                                            <button
                                                                onClick={() => removeFile(file.name)}
                                                                className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm transform hover:scale-110"
                                                            >
                                                                <FaTrash size={10} />
                                                            </button>
                                                        )}

                                                        {(() => {
                                                            const sId = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                                                            const student = studentsInGroup.find(s => s.studentId === sId);
                                                            if (student && student.profileImageUrl) {
                                                                return (
                                                                    <div className="absolute bottom-1 left-1 bg-blue-600 text-white text-[8px] px-1.5 py-0.5 rounded-md font-bold shadow-sm animate-pulse">
                                                                        UPDATE
                                                                    </div>
                                                                );
                                                            } else if (student) {
                                                                return (
                                                                    <div className="absolute bottom-1 left-1 bg-green-600 text-white text-[8px] px-1.5 py-0.5 rounded-md font-bold shadow-sm">
                                                                        NEW
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>

                                                    <div className="px-1 text-center">
                                                        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate" title={file.name}>
                                                            {file.name}
                                                        </p>
                                                        <p className="text-[10px] text-gray-500 dark:text-gray-400">
                                                            {(file.size / 1024).toFixed(1)} KB
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>


                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default BulkUploadStudentImagesPage;


