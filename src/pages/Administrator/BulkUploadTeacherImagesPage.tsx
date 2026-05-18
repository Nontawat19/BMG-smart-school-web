import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import { firestore, storage } from '@/firebase';
import { collection, getDocs, query, where, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { FaCloudUploadAlt, FaTrash, FaCheckCircle, FaExclamationCircle, FaUserTie, FaSearch } from 'react-icons/fa';
import Swal from 'sweetalert2';
import { compressImage } from '@/utils/imageUtils';
import { useSubjectGroups } from '@/hooks/useSubjectGroups';

interface Teacher {
    id: string;
    firstName: string;
    lastName: string;
    idCardNumber: string;
    profileImageUrl?: string;
    learningArea?: string;
}

export default function BulkUploadTeacherImagesPage() {
    const { schoolId } = useParams<{ schoolId: string }>();
    const navigate = useNavigate();
    const [files, setFiles] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ [key: string]: 'pending' | 'uploading' | 'success' | 'error' }>({});
    const [teachersList, setTeachersList] = useState<Teacher[]>([]);
    const [learningArea, setLearningArea] = useState<string>('');
    const { subjectGroups } = useSubjectGroups(schoolId);

    // Fetch teachers when learning area changes or initially
    useEffect(() => {
        if (!schoolId) return;
        
        const fetchTeachers = async () => {
            try {
                const teachersRef = collection(firestore, "school-settings", schoolId, "teachers");
                let q = query(teachersRef);
                
                if (learningArea) {
                    q = query(teachersRef, where("learningArea", "==", learningArea));
                }
                
                const snapshot = await getDocs(q);
                const list = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                })) as Teacher[];
                setTeachersList(list);
            } catch (err) {
                console.error("Error fetching teachers:", err);
            }
        };

        fetchTeachers();
    }, [schoolId, learningArea]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files).filter(file => file.type.startsWith('image/'));
            setFiles(prev => [...prev, ...newFiles]);
            
            // Initialize progress for new files
            const newProgress = { ...uploadProgress };
            newFiles.forEach(f => {
                if (!newProgress[f.name]) newProgress[f.name] = 'pending';
            });
            setUploadProgress(newProgress);
        }
    };

    const removeFile = (fileName: string) => {
        setFiles(prev => prev.filter(f => f.name !== fileName));
        const newProgress = { ...uploadProgress };
        delete newProgress[fileName];
        setUploadProgress(newProgress);
    };

    const handleUpload = async () => {
        if (files.length === 0) {
            Swal.fire('กรุณาเลือกไฟล์', 'กรุณาเลือกรูปภาพอย่างน้อย 1 ไฟล์', 'warning');
            return;
        }

        setUploading(true);
        const results: { fileName: string; idCard: string; status: 'success' | 'error'; wasUpdate?: boolean; error?: string }[] = [];

        const filesToUpload = files.filter(f => uploadProgress[f.name] !== 'success');

        for (const file of filesToUpload) {
            setUploadProgress(prev => ({ ...prev, [file.name]: 'uploading' }));
            
            // Assumes filename is ID Card (e.g. 1234567890123.jpg -> 1234567890123)
            const idCardNumber = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

            // Validate ID Card (13 digits)
            if (!/^\d{13}$/.test(idCardNumber)) {
                setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }));
                results.push({
                    fileName: file.name,
                    idCard: idCardNumber,
                    status: 'error',
                    error: 'ชื่อไฟล์ต้องเป็นเลขบัตรประชาชน 13 หลักเท่านั้น'
                });
                continue;
            }

            try {
                // 1. Find Teacher by idCardNumber
                const teachersRef = collection(firestore, "school-settings", schoolId!, "teachers");
                const q = query(teachersRef, where("idCardNumber", "==", idCardNumber));
                const querySnapshot = await getDocs(q);

                if (querySnapshot.empty) {
                    throw new Error(`ไม่พบข้อมูลครูเลขบัตร ${idCardNumber}`);
                }

                const teacherDoc = querySnapshot.docs[0];
                const teacherData = teacherDoc.data();
                const teacherUid = teacherDoc.id; // Usually teacher document ID is their UID
                const wasUpdate = Boolean(teacherData.profileImageUrl);

                // 2. Delete Old Image if exists
                if (teacherData.profileImageUrl && (teacherData.profileImageUrl.includes('firebasestorage') || teacherData.profileImageUrl.includes('googleap'))) {
                    try {
                        const oldImageRef = ref(storage, teacherData.profileImageUrl);
                        await deleteObject(oldImageRef);
                    } catch (err: any) {
                        if (err.code !== 'storage/object-not-found') {
                            console.warn(`Failed to delete old image for ${idCardNumber}`, err);
                        }
                    }
                }

                // 3. Upload New Image
                const compressedFile = await compressImage(file, 800, 0.8, 'image/jpeg');
                const storagePath = `school-settings/${schoolId}/teachers`;
                const newFileName = `${idCardNumber}.jpg`;
                const finalRef = ref(storage, `${storagePath}/${newFileName}`);

                await uploadBytes(finalRef, compressedFile);
                const downloadURL = await getDownloadURL(finalRef);

                // 4. Update Firestore (Teachers collection)
                await updateDoc(doc(firestore, "school-settings", schoolId!, "teachers", teacherUid), {
                    profileImageUrl: downloadURL,
                    updatedAt: serverTimestamp()
                });

                // 5. Update Firestore (Users collection)
                await updateDoc(doc(firestore, "users", teacherUid), {
                    profileUrl: downloadURL,
                });

                setUploadProgress(prev => ({ ...prev, [file.name]: 'success' }));
                results.push({ fileName: file.name, idCard: idCardNumber, status: 'success', wasUpdate });

                // Update local list for feedback
                setTeachersList(prev => prev.map(t => 
                    t.idCardNumber === idCardNumber ? { ...t, profileImageUrl: downloadURL } : t
                ));

            } catch (err: any) {
                console.error(`Upload error for ${idCardNumber}:`, err);
                setUploadProgress(prev => ({ ...prev, [file.name]: 'error' }));
                results.push({
                    fileName: file.name,
                    idCard: idCardNumber,
                    status: 'error',
                    error: err.message
                });
            }
        }

        setUploading(false);

        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        const newCount = results.filter(r => r.status === 'success' && !r.wasUpdate).length;
        const updateCount = results.filter(r => r.status === 'success' && r.wasUpdate).length;

        if (errorCount > 0) {
            Swal.fire({
                title: 'ดำเนินการเสร็จสิ้น',
                html: `สำเร็จ: ${successCount} รายการ<br/>เพิ่มใหม่: ${newCount} รายการ<br/>อัปเดต: ${updateCount} รายการ<br/>ล้มเหลว: ${errorCount} รายการ<br/><br/>${results.filter(r => r.status === 'error').map(r => `<span class="text-red-500 text-xs">${r.idCard}: ${r.error}</span>`).join('<br/>')}`,
                icon: 'info',
                confirmButtonText: 'รับทราบ',
                background: '#2a2b2f',
                color: '#ffffff'
            });
        } else {
            Swal.fire({
                title: 'สำเร็จ!',
                html: `
                    <p>อัปโหลดรูปภาพครูสำเร็จทั้งหมด ${successCount} รายการ</p>
                    <div class="mt-2 text-sm flex justify-center gap-4">
                        <span class="text-green-400 font-bold">เพิ่มใหม่: ${newCount}</span>
                        <span class="text-blue-400 font-bold">อัปเดต: ${updateCount}</span>
                    </div>
                `,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false,
                background: '#2a2b2f',
                color: '#ffffff'
            });
        }
    };

    return (
        <MainLayout>
            <div className="min-h-screen bg-gray-50 dark:bg-[#1e1f21] text-gray-900 dark:text-white p-4 md:p-8">
                <div className="max-w-6xl mx-auto">
                    <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">อัปโหลดรูปภาพครู (Batch)</h1>
                            <p className="mt-1 text-gray-500 dark:text-gray-400">
                                อัปโหลดรูปภาพพร้อมกันหลายคน โดยใช้ <span className="font-bold text-indigo-400">เลขบัตรประชาชน</span> เป็นชื่อไฟล์
                            </p>
                        </div>
                        <button 
                            onClick={() => navigate(-1)}
                            className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            ย้อนกลับ
                        </button>
                    </header>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Upload Section */}
                        <div className="lg:col-span-1 space-y-6">
                            <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm space-y-4">
                                <h2 className="text-lg font-semibold flex items-center gap-2">
                                    <FaCloudUploadAlt className="text-indigo-500" />
                                    เลือกไฟล์รูปภาพ
                                </h2>

                                <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-400 uppercase tracking-wider text-[10px]">กรองตามกลุ่มสาระ (ไม่บังคับ)</label>
                                    <select 
                                        value={learningArea} 
                                        onChange={(e) => setLearningArea(e.target.value)}
                                        className="w-full bg-gray-50 dark:bg-[#1e1f21] border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="">ทั้งหมด</option>
                                        {subjectGroups.map(group => (
                                            <option key={group.id} value={group.name}>{group.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="relative group">
                                    <input 
                                        type="file" 
                                        multiple 
                                        accept="image/jpeg,image/png" 
                                        onChange={handleFileChange}
                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    />
                                    <div className="border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 group-hover:border-indigo-500 group-hover:bg-indigo-50/10 transition-all">
                                        <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-full text-indigo-500">
                                            <FaCloudUploadAlt size={32} />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-bold">เลือกรูปภาพ</p>
                                            <p className="text-xs text-gray-400 mt-1">ไฟล์ .jpg, .png</p>
                                        </div>
                                    </div>
                                </div>

                                {files.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center text-xs font-bold uppercase tracking-widest text-gray-400">
                                            <span>ไฟล์ที่เลือก ({files.length})</span>
                                            <button onClick={() => setFiles([])} className="text-red-500 hover:underline">ล้างทั้งหมด</button>
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto pr-2 space-y-2 scrollbar-hide">
                                            {files.map((file, idx) => (
                                                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-[#1e1f21] rounded-xl group">
                                                    <div className="flex items-center gap-3 overflow-hidden">
                                                        <div className="w-8 h-8 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden">
                                                            <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" />
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <p className="text-[10px] font-bold truncate">{file.name}</p>
                                                            <p className="text-[9px] text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        {uploadProgress[file.name] === 'success' && <FaCheckCircle className="text-emerald-500 text-xs" />}
                                                        {uploadProgress[file.name] === 'error' && <FaExclamationCircle className="text-red-500 text-xs" />}
                                                        {uploadProgress[file.name] === 'uploading' && <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                                                        
                                                        {uploadProgress[file.name] !== 'success' && uploadProgress[file.name] !== 'uploading' && (
                                                            <button onClick={() => removeFile(file.name)} className="p-1.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <FaTrash size={12} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <button
                                            onClick={handleUpload}
                                            disabled={uploading || files.length === 0}
                                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black text-sm shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                        >
                                            {uploading ? 'กำลังอัปโหลด...' : 'เริ่มอัปโหลดทั้งหมด'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* List/Summary Section */}
                        <div className="lg:col-span-2">
                            <div className="bg-white dark:bg-[#2a2b2f] p-6 rounded-2xl shadow-sm min-h-[500px]">
                                <div className="flex justify-between items-center mb-6">
                                    <h2 className="text-lg font-semibold flex items-center gap-2">
                                        <FaUserTie className="text-indigo-500" />
                                        รายชื่อครูในระบบ
                                    </h2>
                                    <div className="text-xs text-gray-400">
                                        พบ {teachersList.length} ท่าน
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {teachersList.length === 0 ? (
                                        <div className="col-span-2 flex flex-col items-center justify-center py-20 text-gray-400 opacity-50">
                                            <FaSearch size={40} className="mb-4" />
                                            <p>ไม่พบรายชื่อครูตามเงื่อนไขที่เลือก</p>
                                        </div>
                                    ) : (
                                        teachersList.map((teacher) => {
                                            const fileAttached = files.find(f => f.name.startsWith(teacher.idCardNumber));
                                            return (
                                                <div key={teacher.id} className={`flex items-center gap-4 p-4 rounded-2xl border transition-all ${fileAttached ? 'border-indigo-500 bg-indigo-50/20 shadow-sm' : 'border-gray-100 dark:border-gray-700'}`}>
                                                    <div className="relative">
                                                        <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-gray-100 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                                                            {teacher.profileImageUrl ? (
                                                                <img src={teacher.profileImageUrl} className="w-full h-full object-cover object-[center_20%]" alt={`${teacher.firstName} ${teacher.lastName}`} />
                                                            ) : (
                                                                <FaUserTie className="text-gray-300 text-xl" />
                                                            )}
                                                        </div>
                                                        {fileAttached && (
                                                            <div className="absolute -top-1 -right-1 bg-indigo-600 text-white p-1 rounded-full text-[8px] animate-pulse">
                                                                <FaCloudUploadAlt />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="overflow-hidden flex-grow">
                                                        <h3 className="text-sm font-bold truncate">{teacher.firstName} {teacher.lastName}</h3>
                                                        <p className="text-[10px] text-gray-400 font-mono">{teacher.idCardNumber}</p>
                                                        <p className="text-[10px] text-indigo-500 mt-1">{teacher.learningArea || '-'}</p>
                                                    </div>
                                                    {fileAttached && uploadProgress[fileAttached.name] === 'success' && (
                                                        <FaCheckCircle className="text-emerald-500" />
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}
