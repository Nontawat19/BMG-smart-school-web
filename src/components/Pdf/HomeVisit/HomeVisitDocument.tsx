import React from 'react';
import { Document, Font } from '@react-pdf/renderer';
import { HomeVisitPdfProps } from './types';
import Page1 from './Page1';
import Page2 from './Page2';
import Page3 from './Page3';
import Page4 from './Page4';
import Page5 from './Page5';

// Register Thai Font if not already registered (usually handled globally but adding for safety)
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

const HomeVisitDocument: React.FC<HomeVisitPdfProps> = (props) => {
    return (
        <Document title={`รายงานการเยี่ยมบ้าน_${props.student.firstName}_${props.student.lastName}`}>
            <Page1 {...props} />
            <Page2 {...props} />
            <Page3 {...props} />
            <Page4 {...props} />
            <Page5 {...props} />
        </Document>
    );
};

export default HomeVisitDocument;
