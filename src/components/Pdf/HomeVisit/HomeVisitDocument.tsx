import React from "react";
import { Document, Font } from "@react-pdf/renderer";
import { HomeVisitPdfProps } from "./types";
import { buildFamilyMembersFromStudent } from "./PdfHelpers";

import Page1 from "./Page1";
import Page2 from "./Page2";
import Page3 from "./Page3";
import Page4 from "./Page4";

// Register Thai Font
try {
    Font.register({
        family: "TH Sarabun PSK",
        fonts: [
            { src: "/fonts/THSarabunNew.ttf" },
            { src: "/fonts/THSarabunNew-Bold.ttf", fontWeight: "bold" },
        ],
    });
} catch (error) {
    console.error("Error registering font:", error);
}

interface StandardDocumentProps extends HomeVisitPdfProps {
    schoolName?: string;
    educationArea?: string;
}

const HomeVisitDocument: React.FC<StandardDocumentProps> = ({
    student,
    visit,
    familyMembers,
    teacherName,
    teacherPosition,
    teachers,
    schoolName,
    educationArea,
}) => {
    const familyRows = familyMembers?.length ? familyMembers : buildFamilyMembersFromStudent(student);

    return (
        <Document>
            <Page1
                key="home-visit-page-1"
                student={student}
                visit={visit}
                familyMembers={familyRows}
                teacherName={teacherName}
                teachers={teachers}
                schoolName={schoolName}
                educationArea={educationArea}
            />
            <Page2
                key="home-visit-page-2"
                student={student}
                visit={visit}
                familyMembers={familyRows}
                teacherName={teacherName}
                teachers={teachers}
            />
            <Page3
                key="home-visit-page-3"
                student={student}
                visit={visit}
                familyMembers={familyRows}
                teacherName={teacherName}
                teachers={teachers}
            />
            <Page4
                key="home-visit-page-4"
                student={student}
                visit={visit}
                familyMembers={familyRows}
                teacherName={teacherName}
                teacherPosition={teacherPosition}
                teachers={teachers}
            />
        </Document>
    );
};

export default HomeVisitDocument;
