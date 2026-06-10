import React from "react";
import { Text, Image, Page, View } from "@react-pdf/renderer";
import { Student, HomeVisitData, FamilyMember } from "./types";
import { formatFullTitle } from "./utils";

export const SOURCE_W = 1241;
export const SOURCE_H = 1755;
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

export const clean = (value: unknown) => String(value ?? "").trim();
export const normalize = (value: string) => clean(value).replace(/\s+/g, "").replace(/ๆ/g, "").replace(/\//g, "").replace(/-/g, "");
export const num = (value: unknown) => Number(clean(value).replace(/,/g, "")) || 0;
export const optionValues = (value: string | string[] | undefined) => Array.isArray(value) ? value : value ? [value] : [];

export const includesOption = (values: string | string[] | undefined, option: string, aliases: string[] = []) => {
    const needles = [option, ...aliases].map(normalize);
    return optionValues(values).some((value) => needles.some((needle) => normalize(value).includes(needle) || needle.includes(normalize(value))));
};

export const equalsOption = (value: string | undefined, option: string, aliases: string[] = []) => {
    const normalized = normalize(value || "");
    return [option, ...aliases].some((item) => normalized === normalize(item) || normalized.includes(normalize(item)));
};

export const px = (value: number) => (value / SOURCE_W) * PAGE_W;
export const py = (value: number) => (value / SOURCE_H) * PAGE_H;

export const OverlayText = ({
    value,
    x,
    y,
    size = 12,
    width,
    bold = false,
    align = "left",
}: {
    value: unknown;
    x: number;
    y: number;
    size?: number;
    width?: number;
    bold?: boolean;
    align?: "left" | "center" | "right";
}) => {
    const content = clean(value);
    if (!content) return null;
    return (
        <Text
            style={{
                position: "absolute",
                left: px(x),
                top: py(y),
                width: width ? px(width) : undefined,
                fontFamily: "TH Sarabun PSK",
                fontWeight: bold ? "bold" : "normal",
                fontSize: size,
                lineHeight: 1,
                color: "#111",
                textAlign: align,
            }}
        >
            {content}
        </Text>
    );
};

export const Check = ({ checked = true, x, y }: { checked?: boolean; x: number; y: number }) => {
    if (!checked) return null;
    return (
        <Text
            style={{
                position: "absolute",
                left: px(x),
                top: py(y),
                fontFamily: "TH Sarabun PSK",
                fontWeight: "bold",
                fontSize: 13,
                color: "#111",
            }}
        >
            ✓
        </Text>
    );
};

export const Photo = ({ src, x, y, width, height }: { src?: string | null; x: number; y: number; width: number; height: number }) => {
    if (!src) return null;
    return (
        <Image
            src={src}
            style={{
                position: "absolute",
                left: px(x),
                top: py(y),
                width: px(width),
                height: py(height),
                objectFit: "contain",
            }}
        />
    );
};

export const totalMemberIncome = (member: FamilyMember) =>
    clean(member.totalIncome) ||
    clean(member.income) ||
    String(num(member.wageIncome) + num(member.agricultureIncome) + num(member.businessIncome) + num(member.welfareIncome) + num(member.otherIncome) || "");

export const formatCitizenId = (value: string | undefined) => clean(value).replace(/\D/g, "").slice(0, 13);

export const splitParentName = (visit: HomeVisitData) => {
    const first = clean(visit.parentFirstName);
    const last = clean(visit.parentLastName);
    if (first || last) return { first, last };
    const fallback = clean(visit.visitorNameBySide).split(/\s+/);
    return {
        first: fallback.slice(0, -1).join(" ") || fallback[0] || "",
        last: fallback.length > 1 ? fallback[fallback.length - 1] : "",
    };
};

export const joinName = (...parts: Array<string | undefined>) => parts.map(clean).filter(Boolean).join(" ");

export const getStudentGuardianInfo = (student: Student) => {
    const guardianName = joinName(student.guardianTitle, student.guardianFirstName, student.guardianLastName);
    if (guardianName || clean(student.guardianPhone) || clean(student.guardianIdNumber) || clean(student.guardianOccupation)) {
        return {
            first: joinName(student.guardianTitle, student.guardianFirstName),
            last: clean(student.guardianLastName),
            phone: clean(student.guardianPhone),
            citizenId: clean(student.guardianIdNumber),
            occupation: clean(student.guardianOccupation),
            relationship: clean(student.guardianRelationship) || "ผู้ปกครอง",
            income: clean(student.guardianMonthlyIncome),
        };
    }

    const fatherName = joinName(student.fatherTitle, student.fatherFirstName, student.fatherLastName);
    if (fatherName || clean(student.fatherPhone) || clean(student.fatherIdNumber) || clean(student.fatherOccupation)) {
        return {
            first: joinName(student.fatherTitle, student.fatherFirstName),
            last: clean(student.fatherLastName),
            phone: clean(student.fatherPhone),
            citizenId: clean(student.fatherIdNumber),
            occupation: clean(student.fatherOccupation),
            relationship: "บิดา",
            income: clean(student.fatherMonthlyIncome),
        };
    }

    return {
        first: joinName(student.motherTitle, student.motherFirstName),
        last: clean(student.motherLastName),
        phone: clean(student.motherPhone),
        citizenId: clean(student.motherIdNumber),
        occupation: clean(student.motherOccupation),
        relationship: clean(student.motherFirstName || student.motherLastName) ? "มารดา" : "",
        income: clean(student.motherMonthlyIncome),
    };
};

export const buildFamilyMembersFromStudent = (student: Student): FamilyMember[] => {
    const rows: FamilyMember[] = [];
    if (clean(student.fatherFirstName) || clean(student.fatherLastName) || clean(student.fatherMonthlyIncome)) {
        rows.push({
            id: "father",
            name: joinName(student.fatherTitle, student.fatherFirstName, student.fatherLastName),
            relationship: "บิดา",
            age: "",
            education: "",
            occupation: clean(student.fatherOccupation),
            income: clean(student.fatherMonthlyIncome),
            disability: "-",
            wageIncome: clean(student.fatherMonthlyIncome),
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: clean(student.fatherMonthlyIncome),
        });
    }
    if (clean(student.motherFirstName) || clean(student.motherLastName) || clean(student.motherMonthlyIncome)) {
        rows.push({
            id: "mother",
            name: joinName(student.motherTitle, student.motherFirstName, student.motherLastName),
            relationship: "มารดา",
            age: "",
            education: "",
            occupation: clean(student.motherOccupation),
            income: clean(student.motherMonthlyIncome),
            disability: "-",
            wageIncome: clean(student.motherMonthlyIncome),
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: clean(student.motherMonthlyIncome),
        });
    }
    const guardianName = joinName(student.guardianTitle, student.guardianFirstName, student.guardianLastName);
    if (guardianName && !["บิดา", "มารดา"].includes(clean(student.guardianRelationship))) {
        rows.push({
            id: "guardian",
            name: guardianName,
            relationship: clean(student.guardianRelationship) || "ผู้ปกครอง",
            age: "",
            education: "",
            occupation: clean(student.guardianOccupation),
            income: clean(student.guardianMonthlyIncome),
            disability: "-",
            wageIncome: clean(student.guardianMonthlyIncome),
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: clean(student.guardianMonthlyIncome),
        });
    }
    return rows;
};

export const getThaiDate = (isoDate?: string) => {
    if (!isoDate) return { day: "", month: "", year: "" };
    const [year, month, day] = isoDate.split("-");
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    return {
        day: clean(day),
        month: months[(Number(month) || 1) - 1] || "",
        year: year ? String(Number(year) + 543) : "",
    };
};

export const IdDigits = ({ value, x, y, spacing = 24.7 }: { value?: string; x: number; y: number; spacing?: number }) => (
    <>
        {[...formatCitizenId(value)].map((digit, index) => (
            <OverlayText key={`${digit}-${index}`} value={digit} x={x + index * spacing} y={y} size={11} width={12} bold align="center" />
        ))}
    </>
);

export const TemplatePage = ({ bgImage, children }: { bgImage: string; children: React.ReactNode }) => (
    <Page
        size="A4"
        wrap={false}
        style={{ position: "relative", padding: 0, fontFamily: "TH Sarabun PSK" }}
    >
        <Image
            src={bgImage}
            style={{ width: PAGE_W, height: PAGE_H }}
        />
        <View
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: PAGE_W,
                height: PAGE_H,
            }}
        >
            {children}
        </View>
    </Page>
);
