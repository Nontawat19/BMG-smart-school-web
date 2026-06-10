import React from "react";
import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CheckMarkSymbol } from "./Checkbox";
import { homeVisitStandardPage, homeVisitStandardPageNo, homeVisitStandardTitle, homeVisitStandardTopRule } from "./HomeVisitPdfStyles";
import { HomeVisitPdfProps } from "./types";
import { clean, equalsOption, getThaiDate, joinName } from "./PdfHelpers";

interface Page4Props extends HomeVisitPdfProps {}

const styles = StyleSheet.create({
    page: {
        ...homeVisitStandardPage,
        fontSize: 11,
        lineHeight: 1,
    },
    pageNo: { ...homeVisitStandardPageNo },
    title: { ...homeVisitStandardTitle },
    topRule: { ...homeVisitStandardTopRule, marginBottom: 18 },
    subTitle: { textAlign: "center", fontSize: 15.5, fontWeight: "bold", marginBottom: 17 },
    row: { flexDirection: "row", alignItems: "flex-end", minHeight: 18 },
    text: { fontSize: 11, lineHeight: 1, paddingBottom: 2 },
    field: {
        height: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: "#000",
        borderBottomStyle: "dotted",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 1,
    },
    value: { fontSize: 10.5, fontWeight: "bold", lineHeight: 1 },
    optionArea: { marginTop: 3, marginLeft: 28, marginBottom: 15 },
    optionRow: { flexDirection: "row", alignItems: "center", minHeight: 19 },
    square: { width: 10.5, height: 10.5, borderWidth: 0.7, borderColor: "#000", marginRight: 8, alignItems: "center", justifyContent: "center" },
    check: { fontSize: 10, fontWeight: "bold", lineHeight: 1, marginTop: -1 },
    optionText: { fontSize: 11, lineHeight: 1.1 },
    photoTitle: { textAlign: "center", fontSize: 11.5, fontWeight: "bold", marginBottom: 9 },
    photoBox: {
        marginLeft: 22,
        width: 456,
        height: 194,
        borderWidth: 0.8,
        borderColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    photo: { width: "100%", height: "100%", objectFit: "contain" },
    placeholder: { fontSize: 11, color: "#333" },
    certBox: {
        marginTop: 11,
        marginLeft: 25,
        width: 451,
        height: 104,
        borderWidth: 0.8,
        borderColor: "#000",
        paddingTop: 9,
        paddingLeft: 32,
    },
    certText: { fontSize: 11.5, fontWeight: "bold", lineHeight: 1.2 },
    certRow: { flexDirection: "row", alignItems: "flex-end", minHeight: 15, marginTop: 4.5 },
});

const Field = ({ value, width }: { value?: unknown; width: number }) => (
    <View style={[styles.field, { width }]}>
        <Text style={styles.value}>{clean(value)}</Text>
    </View>
);

const Option = ({ checked, label }: { checked?: boolean; label: string }) => (
    <View style={styles.optionRow}>
        <View style={styles.square}>{checked ? <CheckMarkSymbol /> : null}</View>
        <Text style={styles.optionText}>{label}</Text>
    </View>
);

const PhotoBox = ({ title, src, placeholder }: { title: string; src?: string; placeholder?: string }) => (
    <>
        <Text style={styles.photoTitle}>{title}</Text>
        <View style={styles.photoBox}>
            {src ? <Image src={src} style={styles.photo} /> : <Text style={styles.placeholder}>{placeholder}</Text>}
        </View>
    </>
);

const Page4: React.FC<Page4Props> = ({ student, visit, teacherName, teacherPosition }) => {
    const studentName = joinName(student.title, student.firstName, student.lastName);
    const permission = clean(visit.parentHousePhotoPermission);
    const photos = visit.photos || { internal: [], external: [], exterior: "", interior: "", schoolSign: "", sketchMap: "" };
    const allPhotos = Array.from(new Set([
        photos.exterior,
        photos.interior,
        ...(photos.external || []),
        ...(photos.internal || []),
    ].filter(Boolean) as string[]));
    const showHousePhoto = !permission || equalsOption(permission, "อนุญาต");
    const photo1 = showHousePhoto ? allPhotos[0] : photos.schoolSign;
    const photo2 = showHousePhoto ? allPhotos[1] : "";
    const visitDate = getThaiDate(visit.visitDate);

    // Get current date details in Thai format
    const now = new Date();
    const todayDay = String(now.getDate());
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const todayMonth = months[now.getMonth()];
    const todayYear = String(now.getFullYear() + 543);

    return (
        <Page size="A4" wrap={false} style={styles.page}>
            <Text style={styles.pageNo}>หน้า 4/4</Text>
            <Text style={styles.title}>บันทึกการเยี่ยมบ้าน</Text>
            <View style={styles.topRule} />

            <Text style={styles.subTitle}>ภาพถ่ายบ้านนักเรียนที่ได้รับการเยี่ยมบ้าน</Text>
            <View style={styles.row}>
                <Text style={styles.text}>ชื่อ - นามสกุลนักเรียน</Text>
                <Field value={studentName} width={330} />
            </View>
            <View style={styles.row}>
                <Text style={styles.text}>กรุณาระบุ ภาพถ่ายที่แนบมาคือ</Text>
            </View>
            <View style={styles.optionArea}>
                <Option checked={showHousePhoto} label="บ้านที่อาศัยอยู่กับพ่อแม่ (เป็นเจ้าของ/เช่า)" />
                <Option checked={equalsOption(permission, "บ้านของญาติ")} label="บ้านของญาติ/ผู้ปกครองที่ไม่ใช่ญาติ" />
                <Option checked={equalsOption(permission, "บ้านหรือที่พักประเภท")} label="บ้านหรือที่พักประเภท วัด มูลนิธิ หอพัก โรงงาน อยู่กับนายจ้าง" />
                <Option checked={!showHousePhoto && !!permission} label="ภาพนักเรียนและป้ายชื่อโรงเรียนเนื่องจากถ่ายภาพบ้านไม่ได้ เพราะบ้านอยู่ต่างอำเภอ/ต่างจังหวัด/ต่างประเทศ หรือไม่ได้รับอนุญาตให้ถ่ายภาพ" />
            </View>

            <PhotoBox title="รูปที่ 1 ภาพถ่ายสภาพบ้านนักเรียน" src={photo1} placeholder="มีหลังคาและฝาบ้านด้วย" />
            <View style={{ height: 11 }} />
            <PhotoBox title="รูปที่ 2 ภาพถ่ายภายในบ้านนักเรียน" src={photo2} />

            <View style={styles.certBox}>
                <Text style={styles.certText}>ขอรับรองว่าข้อมูล และภาพถ่ายบ้านของนักเรียนเป็นความจริง</Text>
                <View style={[styles.certRow, { paddingLeft: 90 }]}>
                    <Text style={styles.text}>(ลงชื่อ)</Text>
                    <Field value="" width={200} />
                </View>
                <View style={[styles.certRow, { paddingLeft: 90 }]}>
                    <Text style={styles.text}>(</Text>
                    <Field value={teacherName} width={214} />
                    <Text style={styles.text}>)</Text>
                </View>
                <View style={[styles.certRow, { paddingLeft: 90 }]}>
                    <Text style={styles.text}>ตำแหน่ง</Text>
                    <Field value={teacherPosition || "ครู"} width={132} />
                    <Text style={styles.text}>(ครูหรือผู้อำนวยการโรงเรียน)</Text>
                </View>
                <View style={[styles.certRow, { paddingLeft: 90 }]}>
                    <Text style={styles.text}>วันที่</Text>
                    <Field value={todayDay} width={48} />
                    <Text style={styles.text}>เดือน</Text>
                    <Field value={todayMonth} width={74} />
                    <Text style={styles.text}>พ.ศ.</Text>
                    <Field value={todayYear} width={58} />
                </View>
            </View>
        </Page>
    );
};

export default Page4;
