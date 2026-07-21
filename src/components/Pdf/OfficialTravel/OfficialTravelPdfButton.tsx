import React, { useState } from 'react';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { FaPrint, FaSpinner } from 'react-icons/fa';
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
    const [isGenerated, setIsGenerated] = useState(false);

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

    if (!isGenerated) {
        return (
            <button
                onClick={() => setIsGenerated(true)}
                className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-indigo-500/25 transition-all hover:scale-[1.02] hover:shadow-indigo-500/40 active:scale-95"
            >
                <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                <FaPrint className="text-xs transition-transform group-hover:rotate-12" />
                เตรียมไฟล์ PDF
            </button>
        );
    }

    return (
        <PDFDownloadLink
            document={<OfficialTravelPdfDocument data={pdfData} />}
            fileName={`บันทึกข้อความ_${data.subject || 'ไปราชการ'}.pdf`}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-emerald-500/25 transition-all hover:scale-[1.02] hover:shadow-emerald-500/40 active:scale-95"
        >
            {({ loading }) => (
                <>
                    <div className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity group-hover:opacity-100" />
                    {loading ? (
                        <>
                            <FaSpinner className="animate-spin text-xs" /> กำลังสร้าง...
                        </>
                    ) : (
                        <>
                            <FaPrint className="text-xs transition-transform group-hover:scale-110" /> ดาวน์โหลด PDF
                        </>
                    )}
                </>
            )}
        </PDFDownloadLink>
    );
};

export default OfficialTravelPdfButton;
