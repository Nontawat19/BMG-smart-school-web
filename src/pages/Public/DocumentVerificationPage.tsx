import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ref, getDownloadURL, getMetadata } from 'firebase/storage';
import { storage, firestore as db } from '@/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { CheckCircle, AlertCircle, FileText, Download, ShieldCheck, School } from 'lucide-react';
import LoadingScreen from '@/components/LoadingScreen';

interface DocInfo {
    schoolName: string;
    courseTitle: string;
    courseCode: string;
    classDisplay: string;
    updatedAt: string;
    downloadUrl: string;
}

const DocumentVerificationPage: React.FC = () => {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [docInfo, setDocInfo] = useState<DocInfo | null>(null);

    const schoolId = searchParams.get('s');
    const courseId = searchParams.get('c');
    const classId = searchParams.get('cl');
    const room = searchParams.get('r');

    useEffect(() => {
        const verifyDocument = async () => {
            if (!schoolId || !courseId || !classId) {
                setError('ข้อมูลอ้างอิงเอกสารไม่ครบถ้วน');
                setLoading(false);
                return;
            }

            try {
                // 1. Fetch School & Course Data to show verification details
                const schoolSnap = await getDoc(doc(db, 'school-settings', schoolId));
                const courseSnap = await getDoc(doc(db, 'school-settings', schoolId, 'courses', courseId));

                if (!schoolSnap.exists() || !courseSnap.exists()) {
                    setError('ไม่พบข้อมูลสถานศึกษาหรือรายวิชาในระบบ');
                    setLoading(false);
                    return;
                }

                const schoolData = schoolSnap.data();
                const courseData = courseSnap.data();

                // 2. Locate File in Storage
                const roomSlug = room && room !== 'all' ? `_${room}` : '';
                const filePath = `school-settings/${schoolId}/grading/courses/${courseId}/ปพ5_${courseId}_${classId}${roomSlug}.pdf`;
                const storageRef = ref(storage, filePath);

                const [downloadUrl, metadata] = await Promise.all([
                    getDownloadURL(storageRef),
                    getMetadata(storageRef)
                ]);

                // Fetch the actual file content to create a local Blob URL
                // This masks the firebase storage URL from the user's view
                const response = await fetch(downloadUrl);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);

                const formattedClass = classId.toUpperCase().replace(/^M/, 'ม.').replace(/^P/, 'ป.');

                setDocInfo({
                    schoolName: schoolData.schoolName || 'สถานศึกษาในระบบ',
                    courseTitle: courseData.title || '-',
                    courseCode: courseData.code || '-',
                    classDisplay: `${formattedClass}${room && room !== 'all' ? `/${room}` : ' (ทุกห้อง)'}`,
                    updatedAt: new Date(metadata.updated).toLocaleString('th-TH'),
                    downloadUrl: blobUrl // Use the Blob URL instead
                });

            } catch (err: any) {
                console.error("Verification Error:", err);
                setError('ไม่สามารถยืนยันความถูกต้องของเอกสารนี้ได้ หรือเอกสารอาจถูกลบออกไปแล้ว');
            } finally {
                setLoading(false);
            }
        };

        verifyDocument();
    }, [schoolId, courseId, classId, room]);

    if (loading) return <LoadingScreen />;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-[#1a1b1e] flex items-center justify-center p-4 py-12">
            <div className="max-w-xl w-full bg-white dark:bg-[#2a2b2f] rounded-[2.5rem] shadow-2xl overflow-hidden border border-gray-100 dark:border-gray-800">

                {/* Header Decoration */}
                <div className={`h-2 w-full ${error ? 'bg-red-500' : 'bg-emerald-500'}`} />

                <div className="p-8 text-center">
                    {error ? (
                        <>
                            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <AlertCircle className="text-red-600" size={40} />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">การยืนยันล้มเหลว</h1>
                            <p className="text-gray-500 dark:text-gray-400 mb-8">{error}</p>
                            <button
                                onClick={() => window.location.reload()}
                                className="w-full py-4 bg-gray-900 dark:bg-white dark:text-gray-900 text-white rounded-2xl font-bold hover:opacity-90 transition-all"
                            >
                                ลองใหม่อีกครั้ง
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                                <ShieldCheck className="text-emerald-600" size={40} />
                            </div>
                            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">ยืนยันเอกสารสำเร็จ</h1>
                            <p className="text-emerald-600 dark:text-emerald-400 text-sm font-bold flex items-center justify-center gap-1 mb-8 italic">
                                Official Digital Reference Verified
                            </p>

                            <div className="space-y-4 text-left bg-gray-50 dark:bg-gray-800/50 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 mb-8">
                                <div className="flex gap-3">
                                    <School size={18} className="text-indigo-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">สถานศึกษา</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{docInfo?.schoolName}</p>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <FileText size={18} className="text-indigo-500 shrink-0" />
                                    <div>
                                        <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">รายวิชา</p>
                                        <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{docInfo?.courseCode} {docInfo?.courseTitle}</p>
                                        <p className="text-[11px] text-gray-500">ห้อง: {docInfo?.classDisplay}</p>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest">วันที่ออกเอกสารลำสุด</p>
                                    <p className="text-xs font-bold text-gray-600 dark:text-gray-400">{docInfo?.updatedAt}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => window.open(docInfo?.downloadUrl, '_blank')}
                                    className="w-full flex items-center justify-center gap-2 py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20"
                                >
                                    <Download size={20} />
                                    ดาวน์โหลดเอกสาร (ฉบับจริง)
                                </button>

                                <div className="mt-8 text-left">
                                    <p className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-4 flex items-center gap-2">
                                        <FileText size={12} /> เอกสารที่ยืนยันแล้ว
                                    </p>
                                    <div className="aspect-[1/1.4] w-full bg-gray-100 dark:bg-gray-900 rounded-2xl overflow-hidden border border-gray-200 dark:border-gray-700 shadow-inner">
                                        <iframe
                                            src={`${docInfo?.downloadUrl}#toolbar=0&navpanes=0`}
                                            className="w-full h-full border-none"
                                            title="Document Preview"
                                        />
                                    </div>
                                    <p className="mt-2 text-[10px] text-gray-400 text-center italic">
                                        * เอกสารนี้ได้รับการป้องกันและยืนยันความถูกต้องโดยระบบส่วนกลาง
                                    </p>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <div className="bg-gray-50 dark:bg-gray-800/80 p-4 border-t border-gray-100 dark:border-gray-800 text-center">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Easy School Management System</p>
                </div>
            </div>
        </div>
    );
};

export default DocumentVerificationPage;
