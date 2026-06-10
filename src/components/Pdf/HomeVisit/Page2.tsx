import React from "react";
import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CheckMarkSymbol } from "./Checkbox";
import { homeVisitStandardPage, homeVisitStandardPageNo, homeVisitStandardTitle, homeVisitStandardTopRule } from "./HomeVisitPdfStyles";
import { FamilyMember, HomeVisitPdfProps } from "./types";
import { buildFamilyMembersFromStudent, clean, equalsOption, includesOption, num, totalMemberIncome } from "./PdfHelpers";

interface Page2Props extends Omit<HomeVisitPdfProps, "familyMembers"> {
    familyMembers?: FamilyMember[];
}

const styles = StyleSheet.create({
    page: {
        ...homeVisitStandardPage,
        fontSize: 11,
        lineHeight: 1,
    },
    pageNo: { ...homeVisitStandardPageNo },
    title: { ...homeVisitStandardTitle },
    topRule: { ...homeVisitStandardTopRule, marginBottom: 19 },
    contentInset: { marginLeft: 19 },
    row: { flexDirection: "row", alignItems: "flex-end", minHeight: 17 },
    text: { fontSize: 11, lineHeight: 1, paddingBottom: 2 },
    label: { fontSize: 11, lineHeight: 1, paddingBottom: 2 },
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
    table: { marginTop: 3, marginLeft: 20, width: 430, borderWidth: 0.6, borderColor: "#000" },
    tableRow: { flexDirection: "row" },
    cell: {
        borderRightWidth: 0.5,
        borderRightColor: "#000",
        borderBottomWidth: 0.5,
        borderBottomColor: "#000",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 2,
    },
    lastCell: { borderRightWidth: 0 },
    tableHeader: { fontSize: 10.5, fontWeight: "bold", lineHeight: 1, textAlign: "center" },
    tableText: { fontSize: 10.5, lineHeight: 1, textAlign: "center" },
    optionRow: { flexDirection: "row", alignItems: "center", minHeight: 18 },
    square: { width: 9.5, height: 9.5, borderWidth: 0.8, borderColor: "#000", marginRight: 5, alignItems: "center", justifyContent: "center" },
    circle: { width: 10, height: 10, borderWidth: 0.8, borderColor: "#000", borderRadius: 6, marginRight: 5, alignItems: "center", justifyContent: "center" },
    check: { fontSize: 9.5, fontWeight: "bold", lineHeight: 1, marginTop: -1 },
    optionText: { fontSize: 10.8, lineHeight: 1, paddingBottom: 1 },
    sectionGap: { marginTop: 13 },
    twoCol: { flexDirection: "row" },
    col: { width: "50%" },
});

const Field = ({ value, width }: { value?: unknown; width: number }) => (
    <View style={[styles.field, { width }]}>
        <Text style={styles.value}>{clean(value)}</Text>
    </View>
);

const Mark = ({ checked, type = "square" }: { checked?: boolean; type?: "square" | "circle" }) => (
    <View style={type === "circle" ? styles.circle : styles.square}>
        {checked ? <CheckMarkSymbol /> : null}
    </View>
);

const Option = ({ checked, label, type = "square", width }: { checked?: boolean; label: string; type?: "square" | "circle"; width?: number }) => (
    <View style={[styles.optionRow, width ? { width } : {}]}>
        <Mark checked={checked} type={type} />
        <Text style={styles.optionText}>{label}</Text>
    </View>
);

const Cell = ({ children, width, height, last = false }: { children?: React.ReactNode; width: number; height: number; last?: boolean }) => (
    <View style={[styles.cell, { width, height }, last ? styles.lastCell : {}]}>{children}</View>
);

const RelationTable = ({ relationships }: { relationships: HomeVisitPdfProps["visit"]["relationships"] }) => {
    const rows: Array<[keyof typeof relationships, string]> = [
        ["father", "บิดา"],
        ["mother", "มารดา"],
        ["brother", "พี่ชาย/น้องชาย"],
        ["sister", "พี่สาว/น้องสาว"],
        ["grandparents", "ปู่/ย่า/ตา/ยาย"],
        ["relatives", "ญาติ"],
        ["others", "อื่นๆ.............................."],
    ];
    const columns = ["สนิทสนม", "เฉยๆ", "ห่างเหิน", "ขัดแย้ง", "ไม่มี"];

    return (
        <View style={styles.table}>
            <View style={styles.tableRow}>
                <Cell width={185} height={18}><Text style={styles.tableHeader}>สมาชิก</Text></Cell>
                {columns.map((col, index) => (
                    <Cell key={col} width={index === 4 ? 50 : 49} height={18} last={index === 4}>
                        <Text style={styles.tableHeader}>{col}</Text>
                    </Cell>
                ))}
            </View>
            {rows.map(([key, label]) => {
                const relation = clean(relationships?.[key]);
                return (
                    <View key={key} style={styles.tableRow}>
                        <Cell width={185} height={16}><Text style={styles.tableText}>{label}</Text></Cell>
                        {columns.map((col, index) => (
                            <Cell key={col} width={index === 4 ? 50 : 49} height={16} last={index === 4}>
                                {relation === col ? <CheckMarkSymbol /> : null}
                            </Cell>
                        ))}
                    </View>
                );
            })}
        </View>
    );
};

const Page2: React.FC<Page2Props> = ({ student, visit, familyMembers = [] }) => {
    const familyRows = familyMembers.length ? familyMembers : buildFamilyMembersFromStudent(student);
    const tableRows = familyRows.slice(0, 10);
    const householdTotal = tableRows.reduce((sum, member) => sum + num(totalMemberIncome(member)), 0);
    const familyCount = num(visit.familyTotalCount) || (tableRows.length ? tableRows.length + 1 : 1);
    const averageIncome = clean(visit.householdIncomeAverage) || (householdTotal && familyCount ? Math.round(householdTotal / familyCount).toLocaleString("th-TH") : "");

    return (
        <Page size="A4" wrap={false} style={styles.page}>
            <Text style={styles.pageNo}>หน้า 2/4</Text>
            <Text style={styles.title}>บันทึกการเยี่ยมบ้าน</Text>
            <View style={styles.topRule} />

            <View style={styles.contentInset} wrap={false}>
            <View style={styles.row}><Text style={styles.text}>5.   ความสัมพันธ์ในครอบครัว</Text></View>
            <View style={styles.row}>
                <Text style={styles.text}>5.1.  สมาชิกในครอบครัวมีเวลาอยู่ร่วมกันกี่ชั่วโมงต่อวัน</Text>
                <Field value={visit.hoursTogetherPerDay} width={210} />
                <Text style={styles.text}>ชั่วโมง/วัน</Text>
            </View>
            <View style={styles.row}><Text style={styles.text}>5.2.  ความสัมพันธ์ระหว่างนักเรียนกับสมาชิกในครอบครัว</Text></View>
            <RelationTable relationships={visit.relationships} />

            <View style={[styles.row, { marginTop: 9 }]}>
                <Text style={styles.text}>5.3.  กรณีที่ผู้ปกครองไม่อยู่บ้านฝากเด็กนักเรียนอยู่บ้านกับใคร (ตอบเพียง 1 ข้อ)</Text>
            </View>
            <View style={[styles.row, { paddingLeft: 40 }]}>
                <Option checked={equalsOption(visit.caregiverWhenParentsAway, "ญาติ")} label="ญาติ" type="circle" width={90} />
                <Option checked={equalsOption(visit.caregiverWhenParentsAway, "เพื่อนบ้าน")} label="เพื่อนบ้าน" type="circle" width={120} />
                <Option checked={equalsOption(visit.caregiverWhenParentsAway, "นักเรียนอยู่บ้านด้วยตนเอง")} label="นักเรียนอยู่บ้านด้วยตนเอง" type="circle" width={190} />
                <Option checked={equalsOption(visit.caregiverWhenParentsAway, "อื่นๆ")} label="อื่น ๆ ระบุ" type="circle" />
                <Field value={visit.caregiverWhenParentsAwayOther} width={105} />
            </View>

            <View style={[styles.row, { marginTop: 7 }]}>
                <Text style={styles.text}>5.4.  รายได้ครัวเรือนเฉลี่ยต่อคน (รวมรายได้ครัวเรือน หารด้วยจำนวนสมาชิกทั้งหมด)</Text>
                <Field value={averageIncome} width={100} />
                <Text style={styles.text}>บาท (กรอกเฉพาะกรณีนักเรียนไม่ยากจนเท่านั้น)</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.text}>5.5.  นักเรียนได้รับค่าใช้จ่ายจาก</Text>
                <Field value={visit.expensePayer} width={150} />
                <Text style={styles.text}>นักเรียนทำงานหารายได้ อาชีพ</Text>
                <Field value={visit.extraJobDetail} width={150} />
            </View>
            <View style={styles.row}>
                <Text style={styles.text}>รายได้วันละ</Text>
                <Field value={visit.extraIncome} width={200} />
                <Text style={styles.text}>บาท      นักเรียนได้เงินมาโรงเรียนวันละ</Text>
                <Field value={visit.studentAllowancePerDay} width={120} />
                <Text style={styles.text}>บาท</Text>
            </View>
            <View style={styles.row}>
                <Text style={styles.text}>5.6.  สิ่งที่ผู้ปกครองต้องการให้โรงเรียนช่วยเหลือนักเรียน</Text>
            </View>
            <View style={[styles.row, { paddingLeft: 22 }]}>
                <Option checked={includesOption(visit.schoolAssistanceNeeded, "ด้านการเรียน")} label="ด้านการเรียน" width={95} />
                <Option checked={includesOption(visit.schoolAssistanceNeeded, "ด้านพฤติกรรม")} label="ด้านพฤติกรรม" width={110} />
                <Option checked={includesOption(visit.schoolAssistanceNeeded, "ด้านเศรษฐกิจ")} label="ด้านเศรษฐกิจ (เช่น ขอรับทุน)" width={150} />
                <Option checked={includesOption(visit.schoolAssistanceNeeded, "อื่นๆ")} label="อื่นๆ ระบุ" />
                <Field value={visit.schoolAssistanceNeededDetail} width={105} />
            </View>
            <View style={styles.row}>
                <Text style={styles.text}>5.7.  ความช่วยเหลือที่ครอบครัวเคยได้รับจากหน่วยงานหรือต้องการได้รับการช่วยเหลือ</Text>
            </View>
            <View style={[styles.row, { paddingLeft: 22 }]}>
                <Option checked={includesOption(visit.assistanceReceived, "เบี้ยผู้สูงอายุ")} label="เบี้ยผู้สูงอายุ" width={120} />
                <Option checked={includesOption(visit.assistanceReceived, "เบี้ยพิการ")} label="เบี้ยพิการ" width={110} />
                <Option checked={includesOption(visit.assistanceReceived, "อื่นๆ")} label="อื่นๆ ระบุ" />
                <Field value={visit.assistanceReceivedOther} width={250} />
            </View>
            <View style={styles.row}><Text style={styles.text}>5.8. ข้อห่วงใยของผู้ปกครองที่มีต่อนักเรียน</Text></View>
            <View style={[styles.field, { width: 453 }]}>
                <Text style={[styles.value, { textIndent: 30, textAlign: "left", width: "100%", fontWeight: "bold" }]}>{clean(visit.parentConcerns)}</Text>
            </View>
            <Field value="" width={453} />
            <Field value="" width={453} />

            <View style={styles.sectionGap}><Text style={styles.text}>6.   พฤติกรรมและความเสี่ยง</Text></View>
            <View style={styles.row}><Text style={styles.text}>6.1.  สุขภาพ</Text></View>
            <View style={styles.twoCol}>
                <View style={styles.col}>
                    <Option checked={includesOption(visit.healthRisk, "ร่างกายไม่แข็งแรง")} label="ร่างกายไม่แข็งแรง" />
                    <Option checked={includesOption(visit.healthRisk, "ป่วยเป็นโรคร้ายแรง/เรื้อรัง")} label="ป่วยเป็นโรคร้ายแรง/เรื้อรัง" />
                </View>
                <View style={styles.col}>
                    <Option checked={includesOption(visit.healthRisk, "มีโรคประจำตัวหรือเจ็บป่วยบ่อย")} label="มีโรคประจำตัวหรือเจ็บป่วยบ่อย" />
                    <Option checked={includesOption(visit.healthRisk, "สมรรถภาพทางร่างกายต่ำ", ["สมรรถภาพร่างกายต่ำ"])} label="สมรรถภาพทางร่างกายต่ำ" />
                </View>
                <View style={{ width: 160 }}>
                    <Option checked={includesOption(visit.healthRisk, "มีภาวะทุพโภชนาการ")} label="มีภาวะทุพโภชนาการ" />
                </View>
            </View>

            <View style={[styles.row, { marginTop: 13 }]}><Text style={styles.text}>6.2.  สวัสดิการหรือความปลอดภัย</Text></View>
            <View style={styles.twoCol}>
                <View style={styles.col}>
                    <Option checked={includesOption(visit.welfareRisk, "พ่อแม่แยกทางกัน", ["แต่งงานใหม่"])} label="พ่อแม่แยกทางกัน หรือแต่งงานใหม่" />
                    <Option checked={includesOption(visit.welfareRisk, "เจ็บป่วยด้วยโรคร้ายแรง")} label="มีบุคคลในครอบครัวเจ็บป่วยด้วยโรคร้ายแรง/เรื้อรัง/ติดต่อ" />
                    <Option checked={includesOption(visit.welfareRisk, "เล่นการพนัน")} label="บุคคลในครอบครัวเล่นการพนัน" />
                    <Option checked={includesOption(visit.welfareRisk, "ไม่มีผู้ดูแล")} label="ไม่มีผู้ดูแล" />
                    <Option checked={includesOption(visit.welfareRisk, "ถูกทารุณ")} label="ถูกทารุณ/ทำร้ายจากบุคคลในครอบครัว/เพื่อนบ้าน" />
                    <Option checked={includesOption(visit.welfareRisk, "เล่นการพนัน")} label="เล่นการพนัน" />
                </View>
                <View style={styles.col}>
                    <Option checked={includesOption(visit.welfareRisk, "ที่พักอาศัยอยู่ในชุมชนแออัด")} label="ที่พักอาศัยอยู่ในชุมชนแออัดหรือใกล้แหล่งมั่วสุม/สถานเริงรมย์" />
                    <Option checked={includesOption(visit.welfareRisk, "ติดสารเสพติด")} label="บุคคลในครอบครัวติดสารเสพติด" />
                    <Option checked={includesOption(visit.welfareRisk, "ทะเลาะกันในครอบครัว")} label="มีความขัดแย้ง/ทะเลาะกันในครอบครัว" />
                    <Option checked={includesOption(visit.welfareRisk, "ใช้ความรุนแรงในครอบครัว")} label="มีความขัดแย้งและมีการใช้ความรุนแรงในครอบครัว" />
                    <Option checked={includesOption(visit.welfareRisk, "ถูกล่วงละเมิดทางเพศ")} label="ถูกล่วงละเมิดทางเพศ" />
                </View>
            </View>

            <View style={[styles.row, { marginTop: 12 }]}>
                <Text style={styles.text}>6.3.  ระยะทางระหว่างบ้านไปโรงเรียน(ไป/กลับ)</Text>
                <Field value={visit.travelDistance} width={110} />
                <Text style={styles.text}>กิโลเมตร ใช้เวลาเดินทาง</Text>
                <Field value={visit.travelTimeHours} width={55} />
                <Text style={styles.text}>ชม.</Text>
                <Field value={visit.travelTimeMinutes} width={55} />
                <Text style={styles.text}>นาที</Text>
            </View>
            <View style={[styles.row, { paddingLeft: 18 }]}><Text style={styles.text}>การเดินทางของนักเรียนไปโรงเรียน (ตอบเพียง 1 ข้อ)</Text></View>
            <View style={[styles.row, { paddingLeft: 40 }]}>
                <Option checked={equalsOption(visit.travelMethod, "ผู้ปกครองมาส่ง")} label="ผู้ปกครองมาส่ง" type="circle" width={120} />
                <Option checked={equalsOption(visit.travelMethod, "รถโดยสารประจำทาง")} label="รถโดยสารประจำทาง" type="circle" width={145} />
                <Option checked={equalsOption(visit.travelMethod, "รถจักรยานยนต์")} label="รถจักรยานยนต์" type="circle" width={120} />
                <Option checked={equalsOption(visit.travelMethod, "รถโรงเรียน")} label="รถโรงเรียน" type="circle" width={100} />
            </View>
            <View style={[styles.row, { paddingLeft: 40 }]}>
                <Option checked={equalsOption(visit.travelMethod, "รถยนต์")} label="รถยนต์" type="circle" width={120} />
                <Option checked={equalsOption(visit.travelMethod, "รถจักรยาน")} label="รถจักรยาน" type="circle" width={145} />
                <Option checked={equalsOption(visit.travelMethod, "เดิน")} label="เดิน" type="circle" width={120} />
                <Option checked={equalsOption(visit.travelMethod, "อื่นๆ")} label="อื่นๆ" type="circle" />
                <Field value={visit.travelMethodDetail} width={95} />
            </View>
            </View>
        </Page>
    );
};

export default Page2;
