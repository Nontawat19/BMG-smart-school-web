import React from "react";
import { Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CheckMarkSymbol } from "./Checkbox";
import { homeVisitStandardPage, homeVisitStandardPageNo, homeVisitStandardTitle, homeVisitStandardTopRule } from "./HomeVisitPdfStyles";
import { HomeVisitPdfProps } from "./types";
import { clean, equalsOption, getThaiDate, includesOption, joinName, splitParentName } from "./PdfHelpers";

interface Page3Props extends HomeVisitPdfProps {}

const styles = StyleSheet.create({
    page: {
        ...homeVisitStandardPage,
        fontSize: 11,
        lineHeight: 1,
    },
    pageNo: { ...homeVisitStandardPageNo },
    title: { ...homeVisitStandardTitle },
    topRule: { ...homeVisitStandardTopRule, marginBottom: 18 },
    contentInset: { marginLeft: 37, marginRight: 0 },
    section: { marginTop: 7.5 },
    sectionTitle: { fontSize: 11, fontWeight: "bold" as const, lineHeight: 1, marginBottom: 3 },
    row: { flexDirection: "row", alignItems: "center", minHeight: 16.5 },
    col: { flex: 1 },
    optionRow: { flexDirection: "row", alignItems: "center", minHeight: 16.5 },
    square: { width: 9.5, height: 9.5, borderWidth: 0.8, borderColor: "#000", marginRight: 5, alignItems: "center", justifyContent: "center" },
    circle: { width: 10, height: 10, borderWidth: 0.8, borderColor: "#000", borderRadius: 6, marginRight: 5, alignItems: "center", justifyContent: "center" },
    check: { fontSize: 9.5, fontWeight: "bold", lineHeight: 1, marginTop: -1 },
    optionText: { fontSize: 10.8, lineHeight: 1, paddingBottom: 1 },
    field: {
        height: 14,
        borderBottomWidth: 0.5,
        borderBottomColor: "#000",
        borderBottomStyle: "dotted",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 1,
    },
    fieldText: { fontSize: 10.5, fontWeight: "bold", lineHeight: 1 },
    informant: { marginTop: 18, marginLeft: -18, width: 455 },
    informantRow: { flexDirection: "row", alignItems: "center", minHeight: 16.5 },
    signature: { marginTop: 18, alignItems: "flex-end", paddingRight: 49 },
    signatureInner: { width: 250, alignItems: "center" },
    sigText: { fontSize: 10.5, lineHeight: 1.18 },
    sigRow: { flexDirection: "row", alignItems: "flex-end", minHeight: 15 },
    sigField: {
        height: 13,
        borderBottomWidth: 0.5,
        borderBottomColor: "#000",
        borderBottomStyle: "dotted",
        justifyContent: "flex-end",
        alignItems: "center",
    },
});

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

const Field = ({ value, width }: { value?: unknown; width: number }) => (
    <View style={[styles.field, { width }]}>
        <Text style={styles.fieldText}>{clean(value)}</Text>
    </View>
);

const OptionGrid = ({ children }: { children: React.ReactNode }) => (
    <View style={styles.row}>{children}</View>
);

const Page3: React.FC<Page3Props> = ({ visit }) => {
    const visitDate = getThaiDate(visit.visitDate);

    return (
        <Page size="A4" wrap={false} style={styles.page}>
            <Text style={styles.pageNo}>หน้า 3/4</Text>
            <Text style={styles.title}>บันทึกการเยี่ยมบ้าน</Text>
            <View style={styles.topRule} />

            <View style={styles.contentInset} wrap={false}>
            <View>
                <Text style={styles.sectionTitle}>6.4.  ภาระงานความรับผิดชอบของนักเรียนที่มีต่อครอบครัว</Text>
                <OptionGrid>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.studentResponsibilities, "ช่วยงานบ้าน")} label="ช่วยงานบ้าน" />
                        <Option checked={includesOption(visit.studentResponsibilities, "ช่วยค้าขายเล็กๆน้อยๆ")} label="ช่วยค้าขายเล็กๆน้อยๆ" />
                        <Option checked={includesOption(visit.studentResponsibilities, "ช่วยงานในนาไร่")} label="ช่วยงานในนาไร่" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.studentResponsibilities, "ช่วยดูแลคนเจ็บป่วย/พิการ")} label="ช่วยคนดูแลคนเจ็บป่วย/พิการ" />
                        <Option checked={includesOption(visit.studentResponsibilities, "ทำงานแถวบ้าน")} label="ทำงานแถวบ้าน" />
                        <View style={styles.row}>
                            <Option checked={includesOption(visit.studentResponsibilities, "อื่นๆ")} label="อื่น ระบุ" />
                            <Field value="" width={150} />
                        </View>
                    </View>
                </OptionGrid>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.5.  กิจกรรมยามว่างหรืองานอดิเรก</Text>
                <OptionGrid>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.studentHobbies, "ดูทีวี / ฟังเพลง")} label="ดูทีวี / ฟังเพลง" />
                        <Option checked={includesOption(visit.studentHobbies, "อ่านหนังสือ")} label="อ่านหนังสือ" />
                        <Option checked={includesOption(visit.studentHobbies, "แว้น / สก๊อย")} label="แว้น / สก๊อย" />
                        <Option checked={includesOption(visit.studentHobbies, "ไปสวนสาธารณะ")} label="ไปสวนสาธารณะ" />
                        <View style={styles.row}><Option checked={includesOption(visit.studentHobbies, "อื่นๆ")} label="อื่น ๆ ระบุ" /><Field value="" width={135} /></View>
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.studentHobbies, "ไปเที่ยวห้าง / ดูหนัง")} label="ไปเที่ยวห้าง / ดูหนัง" />
                        <Option checked={includesOption(visit.studentHobbies, "ไปหาเพื่อน / เที่ยว")} label="ไปหาเพื่อน / เที่ยว" />
                        <Option checked={includesOption(visit.studentHobbies, "เล่นเกม คอม / มือถือ")} label="เล่นเกม คอม / มือถือ" />
                        <Option checked={includesOption(visit.studentHobbies, "ไปร้านสนุกเกอร์")} label="ไปร้านสนุกเกอร์" />
                    </View>
                </OptionGrid>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.6.  พฤติกรรมการใช้สารเสพติด</Text>
                <OptionGrid>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.drugRisk, "คบเพื่อนในกลุ่มที่ใช้สารเสพติด")} label="คบเพื่อนในกลุ่มที่ใช้สารเสพติด" />
                        <Option checked={includesOption(visit.drugRisk, "อยู่ในสภาพแวดล้อมที่ใช้สารเสพติด")} label="อยู่ในสภาพแวดล้อมที่ใช้สารเสพติด" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.drugRisk, "สมาชิกในครอบครัวเกี่ยวข้องกับยาเสพติด")} label="สมาชิกในครอบครัวข้องเกี่ยวกับยาเสพติด" />
                        <Option checked={includesOption(visit.drugRisk, "ปัจจุบันเกี่ยวข้องกับสารเสพติด")} label="ปัจจุบันเกี่ยวข้องกับสารเสพติด" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.drugRisk, "เป็นผู้ติดบุหรี่ สุรา หรือการใช้สารเสพติดอื่นๆ")} label="เป็นผู้ติดบุหรี่ สุรา หรือการใช้สารเสพติดอื่นๆ" />
                    </View>
                </OptionGrid>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.7.  พฤติกรรมการใช้ความรุนแรง</Text>
                <OptionGrid>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.violenceRisk, "มีการทะเลาะวิวาท")} label="มีการทะเลาะวิวาท" />
                        <Option checked={includesOption(visit.violenceRisk, "ทำร้ายร่างกายผู้อื่น")} label="ทำร้ายร่างกายผู้อื่น" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.violenceRisk, "ก้าวร้าว เกเร")} label="ก้าวร้าว เกเร" />
                        <Option checked={includesOption(visit.violenceRisk, "ทำร้ายร่างกายตนเอง")} label="ทำร้ายร่างกายตนเอง" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.violenceRisk, "ทะเลาะวิวาทเป็นประจำ")} label="ทะเลาะวิวาทเป็นประจำ" />
                    </View>
                </OptionGrid>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.8.  พฤติกรรมทางเพศ</Text>
                <OptionGrid>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.sexualRisk, "อยู่ในกลุ่มขายบริการ")} label="อยู่ในกลุ่มขายบริการ" />
                        <Option checked={includesOption(visit.sexualRisk, "ขายบริการทางเพศ")} label="ขายบริการทางเพศ" />
                    </View>
                    <View style={{ width: 260 }}>
                        <Option checked={includesOption(visit.sexualRisk, "ใช้เครื่องมือสื่อสารที่เกี่ยวข้องกับด้านเพศเป็นเวลานานและบ่อยครั้ง")} label="ใช้เครื่องมือสื่อสารที่เกี่ยวข้องกับด้านเพศเป็นเวลานานและบ่อยครั้ง" />
                        <Option checked={includesOption(visit.sexualRisk, "หมกมุ่นในการใช้เครื่องมือสื่อสารที่เกี่ยวข้องทางเพศ")} label="หมกมุ่นในการใช้เครื่องมือสื่อสารที่เกี่ยวข้องทางเพศ" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.sexualRisk, "ตั้งครรภ์")} label="ตั้งครรภ์" />
                        <Option checked={includesOption(visit.sexualRisk, "มีการมั่วสุมทางเพศ")} label="มีการมั่วสุมทางเพศ" />
                    </View>
                </OptionGrid>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.9.  การติดเกม</Text>
                <OptionGrid>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.gameRisk, "เล่นเกมเกินวันละ 1 ชั่วโมง")} label="เล่นเกมเกินวันละ 1 ชั่วโมง" />
                        <Option checked={includesOption(visit.gameRisk, "ใช้จ่ายเงินผิดปกติ")} label="ใช้จ่ายเงินผิดปกติ" />
                        <Option checked={includesOption(visit.gameRisk, "ใช้เวลาเล่นเกมเกิน 2 ชั่วโมง")} label="ใช้เวลาเล่นเกมเกิน 2 ชั่วโมง" />
                        <Option checked={includesOption(visit.gameRisk, "อื่นๆ", ["อื่น ๆ"])} label="อื่นๆ" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.gameRisk, "ขาดจินตนาการและความคิดสร้างสรรค์")} label="ขาดจินตนาการและความคิดสร้างสรรค์" />
                        <Option checked={includesOption(visit.gameRisk, "อยู่ในกลุ่มเพื่อนเล่นเกม")} label="อยู่ในกลุ่มเพื่อนเล่นเกม" />
                        <Option checked={includesOption(visit.gameRisk, "หมกมุ่น จริงจังในการเล่นเกม")} label="หมกมุ่น จริงจังในการเล่นเกม" />
                    </View>
                    <View style={styles.col}>
                        <Option checked={includesOption(visit.gameRisk, "เก็บตัว แยกตัวจากกลุ่มเพื่อน")} label="เก็บตัว แยกตัวจากกลุ่มเพื่อน" />
                        <Option checked={includesOption(visit.gameRisk, "ร้านเกมอยู่ใกล้บ้านหรือโรงเรียน")} label="ร้านเกมอยู่ใกล้บ้านหรือโรงเรียน" />
                        <Option checked={includesOption(visit.gameRisk, "ใช้เงินสิ้นเปลือง โกหก ลักขโมยเงินเพื่อเล่นเกม")} label="ใช้เงินสิ้นเปลือง โกหก ลักขโมยเงินเพื่อเล่นเกม" />
                    </View>
                </OptionGrid>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.10.การเข้าถึงสื่อคอมพิวเตอร์และอินเตอร์เน็ตที่บ้าน</Text>
                <View style={styles.row}>
                    <Option checked={equalsOption(visit.computerAccess, "สามารถเข้าถึง Internet ได้จากที่บ้าน")} label="สามารถเข้าถึง Internet ได้จากที่บ้าน" width={260} />
                    <Option checked={equalsOption(visit.computerAccess, "ไม่สามารถเข้าถึง Internet ได้จากที่บ้าน")} label="ไม่สามารถเข้าถึง Internet ได้จากที่บ้าน" width={260} />
                </View>
            </View>

            <View style={styles.section}>
                <Text style={styles.sectionTitle}>6.11.การใช้เครื่องมือสื่อสารอิเล็กทรอนิกส์</Text>
                <Option checked={includesOption(visit.electronicUsage, "เคยใช้โทรศัพท์มือถือในระหว่างการเรียน")} label="เคยใช้โทรศัพท์มือถือในระหว่างการเรียน" />
                <Option checked={includesOption(visit.electronicUsage, "เข้าใช้ line, Facebook, twitter หรือ chat (เกินวันละ 1 ชั่วโมง)")} label="เข้าใช้ line, Facebook, twitter หรือ chat (เกินวันละ 1 ชั่วโมง)" />
                <Option checked={includesOption(visit.electronicUsage, "ใช้โทรศัพท์มือถือในระหว่างเรียน 2 - 3/วัน")} label="ใช้โทรศัพท์มือถือในระหว่างเรียน 2 - 3/วัน" />
                <Option checked={includesOption(visit.electronicUsage, "เข้าใช้ line, Facebook, twitter หรือ chat (เกินวันละ 2 ชั่วโมง)")} label="เข้าใช้ line, Facebook, twitter หรือ chat (เกินวันละ 2 ชั่วโมง)" />
            </View>

            <View style={styles.informant}>
                <Text style={styles.sectionTitle}>ผู้ให้ข้อมูลนักเรียน</Text>
                {[
                    ["บิดา", "มารดา", "พี่ชาย", "พี่สาว", "น้า", "อา"],
                    ["ป้า", "ลุง", "ปู่", "ย่า", "ตา", "ยาย"],
                    ["ทวด", "พ่อเลี้ยง", "แม่เลี้ยง"],
                ].map((row, rowIndex) => (
                    <View key={rowIndex} style={styles.informantRow}>
                        {row.map((item) => (
                            <Option key={item} checked={equalsOption(visit.informantRelationship, item)} label={item} type="circle" width={rowIndex === 2 ? 92 : 74} />
                        ))}
                    </View>
                ))}
            </View>
            </View>

            <View style={styles.signature}>
                <View style={styles.signatureInner}>
                    <Text style={styles.sigText}>ขอรับรองว่าข้อมูลดังกล่าวเป็นจริง</Text>
                    <View style={styles.sigRow}>
                        <Text style={styles.sigText}>ลงชื่อผู้ปกครอง/ผู้แทน</Text>
                        <View style={[styles.sigField, { width: 132 }]} />
                    </View>
                    <View style={styles.sigRow}>
                        <Text style={styles.sigText}>(</Text>
                        <View style={[styles.sigField, { width: 230 }]} />
                        <Text style={styles.sigText}>)</Text>
                    </View>
                </View>
            </View>
        </Page>
    );
};

export default Page3;
