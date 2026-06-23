import { useState, useCallback } from 'react';
import Swal from 'sweetalert2';
import html2canvas from 'html2canvas';
import { getStorage, ref, getDownloadURL, uploadBytes, getMetadata } from 'firebase/storage';
import { collection, query, orderBy, limit, getDocs, collectionGroup, where } from 'firebase/firestore';
import { firestore as db, storage } from '@/firebase';
import { pdf } from '@react-pdf/renderer';

const GRADEBOOK_PDF_TEMPLATE_VERSION = '2026-05-08-attendance-sequential-week-labels-v18';
const pdfUploadMetadata = {
    customMetadata: {
        templateVersion: GRADEBOOK_PDF_TEMPLATE_VERSION
    }
};

export const usePdfGenerator = (
    setIsPdfValidating: React.Dispatch<React.SetStateAction<boolean>>,
    setPdfProgress: React.Dispatch<React.SetStateAction<number>>,
    setPdfUrl: React.Dispatch<React.SetStateAction<string | null>>,
    setLiveQrUrl: React.Dispatch<React.SetStateAction<string>>,
    setQrCodeDataUrl: React.Dispatch<React.SetStateAction<string | null>>,
    setIsPdfReady: React.Dispatch<React.SetStateAction<boolean>>,
    validateDataCompleteness: () => boolean,
    currentCourse: any,
    selectedCourse: string,
    selectedClass: string,
    selectedRoom: string,
    schoolId: string,
    year: string,
    semester: string,
    students: any[],
    qrRef: React.RefObject<HTMLDivElement | null>
) => {
    const handleCreatePdf = useCallback(async (
        GradeBookDocument: any,
        incomingPdfProps: any
    ) => {
        setIsPdfValidating(true);
        setPdfProgress(0);

        const isReadyToGenerate = validateDataCompleteness();
        if (!isReadyToGenerate) {
            setIsPdfValidating(false);
            return;
        }

        const roomSlug = selectedRoom ? `_${selectedRoom}` : '';
        const semesterPath = `year_${year}/semester_${semester}`;
        const filePath = `school-settings/${schoolId}/grading/courses/${selectedCourse}/${semesterPath}/ปพ5_${selectedCourse}_${selectedClass}${roomSlug}.pdf`;
        const storageRef = ref(storage, filePath);

        let existingMetadata: any = null;
        let storageUrl = "";

        try {
            existingMetadata = await getMetadata(storageRef);
            storageUrl = await getDownloadURL(storageRef);
        } catch (err) {
            console.log("No existing PDF or metadata found.");
        }

        if (existingMetadata && storageUrl) {
            try {
                const latestGradeQuery = query(
                    collection(db, 'school-settings', schoolId, 'courses', selectedCourse, 'grades'),
                    orderBy('updatedAt', 'desc'),
                    limit(1)
                );
                const gradeSnap = await getDocs(latestGradeQuery);
                let latestUpdate = 0;

                if (!gradeSnap.empty) {
                    const lastGradeUpdate = gradeSnap.docs[0].data()?.updatedAt?.toMillis() || 0;
                    latestUpdate = Math.max(latestUpdate, lastGradeUpdate);
                }

                const targetCode = incomingPdfProps.currentCourse?.code || selectedCourse;
                const attendanceQuery = query(
                    collectionGroup(db, 'ClassroomAttendance'),
                    where('schoolId', '==', schoolId),
                    where('subjectCode', '==', targetCode.replace(/\s/g, '')),
                    where('classId', '==', selectedClass),
                    orderBy('updatedAt', 'desc'),
                    limit(1)
                );

                try {
                    const attendSnap = await getDocs(attendanceQuery);
                    if (!attendSnap.empty) {
                        const lastAttendUpdate = attendSnap.docs[0].data()?.updatedAt?.toMillis() || 0;
                        latestUpdate = Math.max(latestUpdate, lastAttendUpdate);
                    }
                } catch (e) { latestUpdate = Date.now(); } // index missing or query failed → force regenerate

                const pdfUpdateTime = new Date(existingMetadata.updated).getTime();

                const existingTemplateVersion = existingMetadata?.customMetadata?.templateVersion || '';

                if (existingTemplateVersion === GRADEBOOK_PDF_TEMPLATE_VERSION && pdfUpdateTime > latestUpdate) {
                    console.log("Existing PDF is fresh. Skipping generation.");

                    const response = await fetch(storageUrl);
                    const blob = await response.blob();
                    const url = URL.createObjectURL(blob);

                    const subjectTitle = incomingPdfProps.currentCourse?.title || '';
                    const subjectCode = incomingPdfProps.currentCourse?.code || selectedCourse;
                    const formattedClass = selectedClass.toUpperCase().replace(/^M/, 'ม.').replace(/^P/, 'ป.');
                    const classInfo = `${formattedClass}${selectedRoom ? `/${selectedRoom}` : ''}`;
                    const fileName = `${subjectTitle} ${classInfo} ${subjectCode} ปพ.5.pdf`.trim();

                    const link = document.createElement('a');
                    link.href = url;
                    link.download = fileName;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);

                    setIsPdfValidating(false);
                    Swal.fire({
                        icon: 'success',
                        title: 'เรียกคืนเอกสารสำเร็จ',
                        text: 'ข้อมูลเป็นปัจจุบัน ระบบเรียกใช้ไฟล์เดิมจากฐานข้อมูล',
                        timer: 2000,
                        showConfirmButton: false,
                        toast: true,
                        position: 'top-end'
                    });
                    return;
                }
                if (existingTemplateVersion !== GRADEBOOK_PDF_TEMPLATE_VERSION) {
                    console.log("Existing PDF template is outdated. Regenerating.");
                }
            } catch (checkError) {
                console.error("Error checking for fresh PDF:", checkError);
            }
        }

        console.log("Starting New PDF Generation...");

        Swal.fire({
            title: 'กำลังสร้างไฟล์ PDF ใหม่',
            html: `
        <div class="mt-4 px-4 pb-4">
          <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-3 mb-2 overflow-hidden border border-gray-200 dark:border-gray-700">
            <div id="pdf-progress-bar" class="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600 h-full transition-all duration-300 ease-out shadow-lg" style="width: 0%"></div>
          </div>
          <div class="flex justify-between items-center text-xs font-bold text-gray-500">
            <span id="pdf-progress-text">0%</span>
            <span id="pdf-progress-status">กำลังรวบรวมข้อมูล...</span>
          </div>
        </div>
      `,
            allowOutsideClick: false,
            showConfirmButton: false,
            background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
            color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937',
            didOpen: () => {
                Swal.showLoading();
            }
        });

        const updateUI = (val: number, status: string) => {
            const bar = document.getElementById('pdf-progress-bar');
            const text = document.getElementById('pdf-progress-text');
            const statusEl = document.getElementById('pdf-progress-status');
            if (bar) bar.style.width = `${val}%`;
            if (text) text.innerText = `${val}%`;
            if (statusEl) statusEl.innerText = status;
        };

        try {
            updateUI(10, 'กำลังรวบรวมข้อมูลหน่วยเรียน...');

            const verificationUrl = `${window.location.origin}/verify-doc?s=${schoolId}&c=${selectedCourse}&cl=${selectedClass}&r=${selectedRoom || 'all'}&y=${year}&sem=${semester}`;

            if (!storageUrl) {
                updateUI(12, 'เตรียมพื้นที่จัดเก็บสำหรับครั้งแรก...');
                const placeholderDoc = <GradeBookDocument {...incomingPdfProps} students={students.slice(0, 1)} qrCodeDataUrl={undefined} />;
                const placeholderBlob = await pdf(placeholderDoc).toBlob();
                await uploadBytes(storageRef, placeholderBlob, pdfUploadMetadata);
                storageUrl = await getDownloadURL(storageRef);
            }

            setLiveQrUrl(verificationUrl);

            updateUI(20, 'กำลังสร้าง QR Code...');
            await new Promise(r => setTimeout(r, 800));

            let capturedQrDataUrl = undefined;
            if (qrRef.current) {
                updateUI(25, 'กำลังบันทึกภาพ QR Code...');
                const images = qrRef.current.getElementsByTagName('img');
                const loadPromises = Array.from(images).map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        img.onload = resolve;
                        img.onerror = resolve;
                    });
                });

                await Promise.all(loadPromises);
                await new Promise(r => setTimeout(r, 300));

                const canvas = await html2canvas(qrRef.current, {
                    scale: 2,
                    backgroundColor: 'white',
                    useCORS: true,
                    allowTaint: true,
                    logging: false
                });
                capturedQrDataUrl = canvas.toDataURL('image/png');
                setQrCodeDataUrl(capturedQrDataUrl);
                console.log("QR Code captured successfully");
            }

            updateUI(40, 'ตรวจสอบความครบถ้วนเรียบร้อย...');

            updateUI(65, 'กำลังประมวลผลไฟล์ PDF (อาจใช้เวลาสักครู่)...');

            const finalDoc = <GradeBookDocument {...incomingPdfProps} qrCodeDataUrl={capturedQrDataUrl} />;

            console.log("Rendering final PDF...");
            const blob = await pdf(finalDoc).toBlob();
            console.log("PDF Blob generated, size:", blob.size);

            const url = URL.createObjectURL(blob);
            setPdfUrl(url);

            updateUI(90, 'กำลังจัดเก็บเอกสารเข้าฐานข้อมูลกลาง...');
            try {
                await uploadBytes(storageRef, blob, pdfUploadMetadata);
                console.log("Final PDF uploaded to Storage");
            } catch (storageError) {
                console.error("Failed to upload final PDF:", storageError);
            }

            updateUI(100, 'จัดเตรียมไฟล์เสร็จสมบูรณ์!');
            await new Promise(r => setTimeout(r, 300));

            setIsPdfReady(true);
            Swal.close();

            const subjectTitle = currentCourse?.title || '';
            const subjectCode = currentCourse?.code || selectedCourse;
            const formattedClass = selectedClass.toUpperCase()
                .replace(/^M/, 'ม.')
                .replace(/^P/, 'ป.');
            const classInfo = `${formattedClass}${selectedRoom ? `/${selectedRoom}` : ''}`;
            const fileName = `${subjectTitle} ${classInfo} ${subjectCode} ปพ.5.pdf`.trim();
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            Swal.fire({
                icon: 'success',
                title: 'จัดเก็บเอกสารสำเร็จ',
                text: 'เอกสารถูกบันทึกเข้าสู่ระบบเรียบร้อยแล้ว',
                confirmButtonText: 'ตกลง',
                confirmButtonColor: '#4f46e5',
                background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937',
            });

        } catch (error: any) {
            console.error("CRITICAL PDF Error:", error);
            setIsPdfReady(false);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาดในการสร้าง PDF',
                text: `${error?.message || 'Unknown error'}`,
                footer: '<div class="text-xs text-red-500">ตรวจสอบรายละเอียดใน Console (F12)</div>',
                background: document.documentElement.classList.contains('dark') ? '#2a2b2f' : '#ffffff',
                color: document.documentElement.classList.contains('dark') ? '#ffffff' : '#1f2937',
            });
        } finally {
            setIsPdfValidating(false);
        }
    }, [
        schoolId, selectedCourse, selectedClass, selectedRoom, year, semester,
        students, currentCourse, qrRef,
        setIsPdfValidating, setPdfProgress, setPdfUrl, setLiveQrUrl, setQrCodeDataUrl, setIsPdfReady, validateDataCompleteness
    ]);

    return { handleCreatePdf };
};
