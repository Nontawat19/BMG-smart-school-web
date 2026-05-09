import React from 'react';
import { Document, Font } from '@react-pdf/renderer';
import { HomeVisitSummaryPdfProps } from './types';
import SummaryPage1 from './SummaryPage1';
import SummaryPage2 from './SummaryPage2';

// Register Thai Font if not already registered
try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: '/fonts/THSarabunNew.ttf' },
            { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
        ],
    });
    Font.register({
        family: 'Wingdings',
        src: '/fonts/wingding.ttf'
    });
} catch (e) {
    // Already registered is fine
}

const HomeVisitSummaryDocument: React.FC<HomeVisitSummaryPdfProps> = (props) => {
    return (
        <Document title={`สรุปรายงานการเยี่ยมบ้าน_${props.classLevel}_${props.room}`}>
            <SummaryPage1 {...props} />
            <SummaryPage2 stats={props.stats} teacherName={props.teacherName} teachers={props.teachers} />
        </Document>
    );
};

export default HomeVisitSummaryDocument;
