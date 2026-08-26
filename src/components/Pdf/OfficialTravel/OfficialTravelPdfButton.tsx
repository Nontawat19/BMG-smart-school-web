import React, { useState } from 'react';
import { pdf, PDFViewer } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { FaPrint, FaSpinner, FaTimes } from 'react-icons/fa';
import OfficialTravelPdfDocument from './OfficialTravelPdfDocument';

interface Props {
    data: any;
    schoolName: string;
    schoolAffiliation?: string;
    directorName?: string;
    deputyName?: string;
    personnelHeadName?: string;
    personnelHeadRoleLabel?: string;
}

const OfficialTravelPdfButton: React.FC<Props> = ({ data, schoolName, schoolAffiliation, directorName, deputyName, personnelHeadName, personnelHeadRoleLabel }) => {
    const [showPreview, setShowPreview] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Prepare data for the document
    const pdfData = {
        schoolName: schoolName,
        schoolAffiliation: schoolAffiliation || data.schoolAffiliation,
        directorName: directorName,
        deputyName: deputyName,
        personnelHeadName: personnelHeadName,
        personnelHeadRoleLabel: personnelHeadRoleLabel,
        requesterName: data.requesterName,
        position: data.position,
        department: data.department,
        subject: data.subject,
        to: data.to,
        reason: data.reason,
        location: data.location,
        startDate: data.startDate,
        endDate: data.endDate,
        transportType: data.transportType,
        budgetType: data.budgetType,
        budgetDetail: data.budgetDetail,
        specificExpenses: data.specificExpenses,
        transportDetail: data.transportDetail,
        refDocument: data.refDocument,
        refDate: data.refDate,
        docNo: data.docNo,
        coAdventurers: data.coAdventurers,
        requiresSubstitute: data.requiresSubstitute,
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        try {
            const blob = await pdf(<OfficialTravelPdfDocument data={pdfData} />).toBlob();
            saveAs(blob, `บันทึกข้อความ_${data.subject || 'ไปราชการ'}.pdf`);
        } catch (err) {
            console.error('Error generating official travel PDF:', err);
        } finally {
            setIsDownloading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowPreview(true)}
                className="group relative inline-flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-all hover:scale-[1.02] hover:shadow-red-500/40 active:scale-95"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                <FaPrint className="text-xs transition-transform group-hover:rotate-12" />
                ดาวน์โหลด PDF
            </button>

            {showPreview && (
                <div
                    className="fixed inset-0 top-[60px] z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    onClick={() => setShowPreview(false)}
                >
                    <div
                        className="flex h-[calc(100vh-100px)] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#1e1f21]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-white/10">
                            <h2 className="text-base font-bold text-gray-900 dark:text-white">
                                ตัวอย่างเอกสาร — บันทึกข้อความขอไปราชการ
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleDownload}
                                    disabled={isDownloading}
                                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {isDownloading ? <FaSpinner className="animate-spin" /> : <FaPrint />}
                                    {isDownloading ? "กำลังบันทึก..." : "ดาวน์โหลด"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowPreview(false)}
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/10"
                                    title="ปิด"
                                >
                                    <FaTimes size={18} />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-hidden rounded-b-2xl bg-gray-100 dark:bg-gray-900">
                            <PDFViewer width="100%" height="100%" className="h-full w-full border-none" showToolbar={true}>
                                <OfficialTravelPdfDocument data={pdfData} />
                            </PDFViewer>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default OfficialTravelPdfButton;
