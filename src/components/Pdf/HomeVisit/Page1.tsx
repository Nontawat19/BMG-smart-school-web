import React from "react";
import { Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { CheckMarkSymbol } from "./Checkbox";
import { homeVisitStandardPage, homeVisitStandardPageNo, homeVisitStandardTitle, homeVisitStandardTopRule } from "./HomeVisitPdfStyles";
import { FamilyMember, HomeVisitPdfProps, Student } from "./types";
import { formatFullTitle } from "./utils";
import {
    buildFamilyMembersFromStudent,
    clean,
    equalsOption,
    formatCitizenId,
    getStudentGuardianInfo,
    includesOption,
    num,
    splitParentName,
    totalMemberIncome,
} from "./PdfHelpers";

interface Page1Props extends Omit<HomeVisitPdfProps, "familyMembers"> {
    schoolName?: string;
    educationArea?: string;
    familyMembers?: FamilyMember[];
}

const styles = StyleSheet.create({
    page: {
        ...homeVisitStandardPage,
        paddingBottom: 30,
        fontSize: 11,
        lineHeight: 1,
    },
    pageNo: {
        ...homeVisitStandardPageNo,
    },
    title: {
        ...homeVisitStandardTitle,
    },
    topRule: {
        ...homeVisitStandardTopRule,
        marginBottom: 17,
    },
    instructionTitle: {
        fontSize: 12,
        fontWeight: "bold",
        marginLeft: 0,
        marginBottom: 7,
    },
    bulletRow: {
        flexDirection: "row",
        marginLeft: 18,
        marginBottom: 4,
        alignItems: "flex-start",
    },
    bullet: {
        width: 12,
        fontSize: 10,
        lineHeight: 1,
        marginTop: 2,
    },
    instructionText: {
        flex: 1,
        fontSize: 10.8,
        lineHeight: 1.2,
    },
    instructionInline: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
    },
    inlineText: {
        fontSize: 10.8,
        lineHeight: 1.2,
    },
    inlineCircle: {
        width: 8.5,
        height: 8.5,
        borderWidth: 0.8,
        borderColor: "#000",
        borderRadius: 4.5,
        marginHorizontal: 3,
    },
    inlineSquare: {
        width: 8,
        height: 8,
        borderWidth: 0.8,
        borderColor: "#000",
        marginHorizontal: 3,
    },
    formArea: {
        position: "relative",
        marginTop: 10,
    },
    row: {
        flexDirection: "row",
        alignItems: "flex-end",
        minHeight: 17,
    },
    label: {
        fontSize: 11,
        lineHeight: 1,
        paddingBottom: 2,
    },
    field: {
        height: 15,
        borderBottomWidth: 0.5,
        borderBottomColor: "#000",
        borderBottomStyle: "dotted",
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: 1,
    },
    fieldText: {
        fontSize: 10.5,
        fontWeight: "bold",
        lineHeight: 1,
    },
    fieldTextSmall: {
        fontSize: 9.2,
        fontWeight: "bold",
        lineHeight: 1,
    },
    photoBox: {
        position: "absolute",
        top: 0,
        right: 0,
        width: 58,
        height: 66,
        borderWidth: 0.8,
        borderColor: "#000",
        alignItems: "center",
        justifyContent: "center",
    },
    photoText: {
        fontSize: 9.5,
        lineHeight: 1.3,
        textAlign: "center",
    },
    studentPhoto: {
        width: "100%",
        height: "100%",
        objectFit: "cover",
    },
    number: {
        width: 15,
        fontSize: 11,
        lineHeight: 1,
        paddingBottom: 2,
    },
    idBoxes: {
        flexDirection: "row",
        alignItems: "center",
        height: 14,
    },
    idBox: {
        width: 10.7,
        height: 12.8,
        borderWidth: 0.7,
        borderColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 1.5,
    },
    idDigit: {
        fontSize: 9.4,
        lineHeight: 1,
    },
    circle: {
        width: 10.5,
        height: 10.5,
        borderWidth: 0.8,
        borderColor: "#000",
        borderRadius: 6,
        marginRight: 4,
        alignItems: "center",
        justifyContent: "center",
    },
    square: {
        width: 9.6,
        height: 9.6,
        borderWidth: 0.8,
        borderColor: "#000",
        marginRight: 4,
        alignItems: "center",
        justifyContent: "center",
    },
    checkMark: {
        fontSize: 10,
        fontWeight: "bold",
        lineHeight: 1,
        marginTop: -1,
    },
    optionRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    optionText: {
        fontSize: 10.8,
        lineHeight: 1,
        paddingBottom: 1,
    },
    table: {
        width: 453,
        borderWidth: 0.6,
        borderColor: "#000",
        marginTop: 2,
        marginLeft: 0,
    },
    tableRow: {
        flexDirection: "row",
    },
    cell: {
        borderRightWidth: 0.5,
        borderRightColor: "#000",
        borderBottomWidth: 0.5,
        borderBottomColor: "#000",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 1.5,
    },
    cellLast: {
        borderRightWidth: 0,
    },
    tableHeader: {
        fontSize: 9.3,
        fontWeight: "bold",
        textAlign: "center",
        lineHeight: 1.08,
    },
    tableText: {
        fontSize: 8.8,
        textAlign: "center",
        lineHeight: 1,
    },
    summaryLabel: {
        width: 432,
        borderRightWidth: 0.5,
        borderRightColor: "#000",
        paddingLeft: 5,
        justifyContent: "center",
    },
    summaryText: {
        fontSize: 9.4,
        fontWeight: "bold",
        lineHeight: 1,
    },
    section4: {
        marginTop: 17,
        paddingLeft: 0,
    },
    sectionRow: {
        flexDirection: "row",
        alignItems: "center",
        minHeight: 17,
    },
    sectionLabel: {
        width: 125,
        fontSize: 11,
        lineHeight: 1,
    },
    vehicleLabel: {
        width: 230,
        paddingLeft: 18,
        fontSize: 11,
        lineHeight: 1,
    },
});

const columns = [28, 47, 20, 59, 41, 52, 46, 84, 55, 21];
const incomeWidth = columns.slice(4).reduce((sum, value) => sum + value, 0);

const textStyleFor = (value: unknown) => clean(value).length > 30 ? styles.fieldTextSmall : styles.fieldText;

const Field = ({
    value,
    width,
    small = false,
    align = "center",
}: {
    value?: unknown;
    width: number;
    small?: boolean;
    align?: "center" | "left";
}) => (
    <View style={[styles.field, { width, alignItems: align === "left" ? "flex-start" : "center" }]}>
        <Text style={small ? styles.fieldTextSmall : textStyleFor(value)}>{clean(value)}</Text>
    </View>
);

const IdBoxes = ({ value }: { value?: string }) => {
    const digits = formatCitizenId(value).padEnd(13, " ").slice(0, 13).split("");
    return (
        <View style={styles.idBoxes}>
            {digits.map((digit, index) => (
                <View key={`${index}-${digit}`} style={styles.idBox}>
                    <Text style={styles.idDigit}>{digit.trim()}</Text>
                </View>
            ))}
        </View>
    );
};

const Mark = ({ checked, type = "square" }: { checked?: boolean; type?: "square" | "circle" }) => (
    <View style={type === "circle" ? styles.circle : styles.square}>
        {checked ? <CheckMarkSymbol /> : null}
    </View>
);

const Option = ({
    checked,
    label,
    type = "square",
    width,
}: {
    checked?: boolean;
    label: string;
    type?: "square" | "circle";
    width?: number;
}) => (
    <View style={[styles.optionRow, width ? { width } : {}]}>
        <Mark checked={checked} type={type} />
        <Text style={styles.optionText}>{label}</Text>
    </View>
);

const TableCell = ({
    children,
    width,
    height,
    last = false,
}: {
    children?: React.ReactNode;
    width: number;
    height: number;
    last?: boolean;
}) => (
    <View style={[styles.cell, { width, height }, last ? styles.cellLast : {}]}>
        {children}
    </View>
);


const FamilyIncomeTable = ({
    rows,
    monthlyIncome,
    averageIncome,
}: {
    rows: FamilyMember[];
    monthlyIncome: string;
    averageIncome: string;
}) => {
    const paddedRows = [...rows.slice(0, 10)];
    while (paddedRows.length < 10) {
        paddedRows.push({
            id: `empty-${paddedRows.length}`,
            name: "",
            relationship: "",
            age: "",
            education: "",
            occupation: "",
            income: "",
            disability: "",
            wageIncome: "",
            agricultureIncome: "",
            businessIncome: "",
            welfareIncome: "",
            otherIncome: "",
            totalIncome: "",
        });
    }

    return (
        <View style={styles.table}>
            <View style={styles.tableRow}>
                <TableCell width={columns[0]} height={85}>
                    <Text style={styles.tableHeader}>คนที่</Text>
                </TableCell>
                <TableCell width={columns[1]} height={85}>
                    <Text style={styles.tableHeader}>ความสัมพันธ์{"\n"}กับนักเรียน</Text>
                </TableCell>
                <TableCell width={columns[2]} height={85}>
                    <Text style={styles.tableHeader}>อายุ</Text>
                </TableCell>
                <TableCell width={columns[3]} height={85}>
                    <Text style={styles.tableHeader}>ความพิการทาง{"\n"}ร่างกาย/{"\n"}สติปัญญา{"\n"}(ใส่เครื่องหมาย{"\n"}ถูก หรือ - )</Text>
                </TableCell>
                <View>
                    <View style={[styles.cell, { width: incomeWidth, height: 18 }, styles.cellLast]}>
                        <Text style={styles.tableHeader}>รายได้เฉลี่ยต่อเดือนแยกตามประเภท  (บาท/เดือน)</Text>
                    </View>
                    <View style={styles.tableRow}>
                        <TableCell width={columns[4]} height={67}>
                            <Text style={styles.tableHeader}>ค่าจ้าง{"\n"}เงินเดือน</Text>
                        </TableCell>
                        <TableCell width={columns[5]} height={67}>
                            <Text style={styles.tableHeader}>ประกอบอาชีพ{"\n"}ทางการเกษตร{"\n"}(หลังหัก{"\n"}ค่าใช้จ่าย)</Text>
                        </TableCell>
                        <TableCell width={columns[6]} height={67}>
                            <Text style={styles.tableHeader}>ธุรกิจส่วนตัว{"\n"}(หลังหัก{"\n"}ค่าใช้จ่าย)</Text>
                        </TableCell>
                        <TableCell width={columns[7]} height={67}>
                            <Text style={styles.tableHeader}>สวัสดิการจากรัฐ/เอกชน{"\n"}(เงินบำนาญ, เบี้ยผู้สูงอายุ,{"\n"}อุดหนุนเด็กแรกเกิด,{"\n"}อุดหนุนคนพิการ, อื่นๆ</Text>
                        </TableCell>
                        <TableCell width={columns[8]} height={67}>
                            <Text style={styles.tableHeader}>รายได้{"\n"}จากแหล่งอื่น{"\n"}(เงินโอน, ค่า{"\n"}เช่า, ดอกเบี้ย,{"\n"}อื่นๆ)</Text>
                        </TableCell>
                        <TableCell width={columns[9]} height={67} last>
                            <Text style={styles.tableHeader}>รายได้{"\n"}รวม{"\n"}เฉลี่ยต่อ{"\n"}เดือน</Text>
                        </TableCell>
                    </View>
                </View>
            </View>

            {paddedRows.map((member, index) => (
                <View key={member.id || index} style={styles.tableRow}>
                    <TableCell width={columns[0]} height={15}>
                        <Text style={styles.tableText}>{index + 1}</Text>
                    </TableCell>
                    <TableCell width={columns[1]} height={15}>
                        <Text style={styles.tableText}>{clean(member.relationship)}</Text>
                    </TableCell>
                    <TableCell width={columns[2]} height={15}>
                        <Text style={styles.tableText}>{clean(member.age)}</Text>
                    </TableCell>
                    <TableCell width={columns[3]} height={15}>
                        <Text style={styles.tableText}>{clean(member.disability)}</Text>
                    </TableCell>
                    <TableCell width={columns[4]} height={15}>
                        <Text style={styles.tableText}>{clean(member.wageIncome)}</Text>
                    </TableCell>
                    <TableCell width={columns[5]} height={15}>
                        <Text style={styles.tableText}>{clean(member.agricultureIncome)}</Text>
                    </TableCell>
                    <TableCell width={columns[6]} height={15}>
                        <Text style={styles.tableText}>{clean(member.businessIncome)}</Text>
                    </TableCell>
                    <TableCell width={columns[7]} height={15}>
                        <Text style={styles.tableText}>{clean(member.welfareIncome)}</Text>
                    </TableCell>
                    <TableCell width={columns[8]} height={15}>
                        <Text style={styles.tableText}>{clean(member.otherIncome)}</Text>
                    </TableCell>
                    <TableCell width={columns[9]} height={15} last>
                        <Text style={styles.tableText}>{clean(totalMemberIncome(member))}</Text>
                    </TableCell>
                </View>
            ))}

            <View style={styles.tableRow}>
                <View style={[styles.summaryLabel, { height: 16 }]}>
                    <Text style={styles.summaryText}>รวมรายได้ครัวเรือน (รายการที่ 1 - 10)</Text>
                </View>
                <TableCell width={columns[9]} height={16} last>
                    <Text style={styles.tableText}>{monthlyIncome}</Text>
                </TableCell>
            </View>
            <View style={styles.tableRow}>
                <View style={[styles.summaryLabel, { height: 16, borderBottomWidth: 0 }]}>
                    <Text style={styles.summaryText}>รายได้ครัวเรือนเฉลี่ยต่อคน (รวมรายได้ครัวเรือน หารด้วยจำนวนสมาชิกทั้งหมด จากข้อ 2)</Text>
                </View>
                <TableCell width={columns[9]} height={16} last>
                    <Text style={styles.tableText}>{averageIncome}</Text>
                </TableCell>
            </View>
        </View>
    );
};

const Page1: React.FC<Page1Props> = ({ student, visit, familyMembers = [], schoolName, educationArea }) => {
    const school = clean(visit.schoolName) || clean(schoolName);
    const area = clean(visit.educationArea) || clean(educationArea);
    const studentWithIds = student as Student & { idCardNumber?: string; citizenId?: string; nationalId?: string };
    const studentFirstName = `${formatFullTitle(student.title)}${student.firstName || ""}`;
    const classText = `${student.classLevel || ""}${student.room ? `/${student.room}` : ""}`;
    const studentGuardian = getStudentGuardianInfo(student);
    const visitParent = splitParentName(visit);
    const parent = {
        first: clean(visitParent.first) || studentGuardian.first,
        last: clean(visitParent.last) || studentGuardian.last,
    };
    const parentPhone = clean(visit.parentPhone) || studentGuardian.phone || clean(visit.studentPhone);
    const parentCitizenId = formatCitizenId(clean(visit.parentCitizenId) || studentGuardian.citizenId);
    const parentRelationship = clean(visit.relationshipWithStudent) || studentGuardian.relationship;
    const parentOccupation = clean(visit.parentOccupation) || studentGuardian.occupation;
    const familyRows = familyMembers.length ? familyMembers : buildFamilyMembersFromStudent(student);
    const tableRows = familyRows.slice(0, 10);
    const householdTotal = tableRows.reduce((sum, member) => sum + num(totalMemberIncome(member)), 0);
    const familyCount = num(visit.familyTotalCount) || (tableRows.length ? tableRows.length + 1 : 1);
    const displayFamilyCount = num(visit.familyTotalCount) > 0 ? clean(visit.familyTotalCount) : (tableRows.length ? String(tableRows.length + 1) : "");
    const monthlyIncome = clean(visit.familyMonthlyIncome) || (householdTotal ? householdTotal.toLocaleString("th-TH") : "");
    const averageIncome = clean(visit.householdIncomeAverage) || (householdTotal && familyCount ? Math.round(householdTotal / familyCount).toLocaleString("th-TH") : "");
    const studentPhoto = student.profileImageUrl;
    const hasPoorHousingCondition = equalsOption(visit.housingCondition, "สภาพบ้านชำรุดทรุดโทรม หรือ บ้านทำจากวัสดุพื้นบ้าน เช่น ไม้ไผ่ ใบจากหรือวัสดุเหลือใช้");
    const hasNoToilet = equalsOption(visit.housingCondition, "ไม่มีห้องส้วมในที่อยู่อาศัยและบริเวณ") || equalsOption(visit.utilitiesToilet, "ไม่มี");

    return (
        <Page size="A4" wrap={false} style={styles.page}>
            <Text style={styles.pageNo}>หน้า 1/4</Text>
            <Text style={styles.title}>บันทึกการเยี่ยมบ้าน</Text>
            <View style={styles.topRule} />
            <Text style={styles.instructionTitle}>คำชี้แจง :</Text>
            <View style={styles.bulletRow}>
                <Text style={styles.bullet}>●</Text>
                <Text style={styles.instructionText}>แบบบันทึกการเยี่ยมบ้านฉบับนี้รวมการคัดกรองนักเรียนยากจนเข้าด้วยกัน เพื่อให้คุณครูสามารถลงพื้นที่ได้พร้อมกันในครั้งเดียว</Text>
            </View>
            <View style={styles.bulletRow}>
                <Text style={styles.bullet}>●</Text>
                <View style={styles.instructionInline}>
                    <Text style={styles.inlineText}>การตอบแบบสอบถาม : หากเป็นตัวเลือก</Text>
                    <View style={styles.inlineCircle} />
                    <Text style={styles.inlineText}>หมายถึง ให้ตอบเพียงข้อเดียว และ หากเป็นตัวเลือก</Text>
                    <View style={styles.inlineSquare} />
                    <Text style={styles.inlineText}>หมายถึง ให้ตอบได้มากกว่า 1 ข้อ</Text>
                </View>
            </View>

            <View style={styles.formArea}>
                <View style={styles.photoBox}>
                    {studentPhoto ? (
                        <Image src={studentPhoto} style={styles.studentPhoto} />
                    ) : (
                        <Text style={styles.photoText}>รูปถ่าย{"\n"}นักเรียน</Text>
                    )}
                </View>

                <View style={[styles.row, { paddingRight: 68, marginBottom: 9 }]}>
                    <Text style={styles.label}>โรงเรียน</Text>
                    <Field value={school} width={205} />
                    <Text style={styles.label}>สพป./สพม.</Text>
                    <Field value={area} width={98} small />
                </View>

                <View style={[styles.row, { paddingRight: 68 }]}>
                    <Text style={styles.number}>1.</Text>
                    <Text style={styles.label}>ชื่อนักเรียน</Text>
                    <Field value={studentFirstName} width={135} />
                    <Text style={styles.label}>นามสกุล</Text>
                    <Field value={student.lastName} width={108} />
                    <Text style={styles.label}>ชั้น</Text>
                    <Field value={classText} width={38} />
                </View>

                <View style={[styles.row, { paddingRight: 68 }]}>
                    <View style={{ width: 15 }} />
                    <Text style={styles.label}>เลขที่บัตรประชาชน</Text>
                    <View style={{ width: 5 }} />
                    <IdBoxes value={studentWithIds.idCardNumber || studentWithIds.citizenId || studentWithIds.nationalId} />
                </View>

                <View style={styles.row}>
                    <Text style={styles.number}>2.</Text>
                    <Text style={styles.label}>ชื่อผู้ปกครองนักเรียน</Text>
                    <Field value={parent.first} width={75} />
                    <Text style={styles.label}>นามสกุล</Text>
                    <Field value={parent.last} width={75} />
                    <Text style={styles.label}>เบอร์โทรศัพท์</Text>
                    <Field value={parentPhone} width={60} />
                    <Option checked={!!visit.parentNoGuardian} label="ไม่มีผู้ปกครอง" type="circle" />
                </View>

                <View style={styles.row}>
                    <View style={{ width: 15 }} />
                    <Text style={styles.label}>ความสัมพันธ์ของผู้ปกครองกับนักเรียน</Text>
                    <Field value={parentRelationship} width={75} />
                    <Text style={styles.label}>อาชีพ</Text>
                    <Field value={parentOccupation} width={75} />
                    <Text style={styles.label}>การศึกษาสูงสุด</Text>
                    <Field value={clean(visit.parentEducation)} width={55} />
                </View>

                <View style={styles.row}>
                    <View style={{ width: 15 }} />
                    <Text style={styles.label}>เลขที่บัตรประชาชน</Text>
                    <View style={{ width: 5 }} />
                    <IdBoxes value={parentCitizenId} />
                    <View style={{ width: 15 }} />
                    <Option checked={!!visit.parentNoCitizenId} label="ไม่มีบัตรประจำตัวประชาชน" type="circle" />
                </View>

                <View style={styles.row}>
                    <View style={{ width: 15 }} />
                    <Option checked={!!visit.parentWelfareRegistered} label="เคยลงทะเบียนเพื่อสวัสดิการแห่งรัฐ (ลงทะเบียนคนจน)" type="circle" />
                </View>
            </View>

            <View style={[styles.row, { marginTop: 6 }]}>
                <Text style={styles.number}>3.</Text>
                <Text style={styles.label}>จำนวนสมาชิกในครัวเรือน (รวมตัวนักเรียน)</Text>
                <Field value={displayFamilyCount} width={50} />
                <Text style={styles.label}>คน มีรายละเอียดดังนี้ (กรอกเฉพาะนักเรียนยากจนเท่านั้น)</Text>
            </View>

            <FamilyIncomeTable rows={tableRows} monthlyIncome={monthlyIncome} averageIncome={averageIncome} />

            <View style={styles.section4}>
                <View style={styles.sectionRow}>
                    <Text style={[styles.label, { width: 260 }]}>4.  สถานะของครัวเรือน กรอกเฉพาะบุคคลที่อาศัยในบ้านปัจจุบัน</Text>
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>4.1 ครัวเรือนมีภาระพึ่งพิง ดังนี้</Text>
                    <Option checked={includesOption(visit.householdDependency, "มีคนพิการ")} label="มีคนพิการ" width={120} />
                    <Option checked={includesOption(visit.householdDependency, "มีผู้สูงอายุเกิน 60 ปี", ["ผู้สูงอายุเกิน 60 ปี"])} label="มีผู้สูงอายุเกิน 60 ปี" width={208} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel} />
                    <Option checked={includesOption(visit.householdDependency, "เป็นพ่อ/แม่เลี้ยงเดี่ยว")} label="เป็นพ่อ/แม่เลี้ยงเดี่ยว" width={120} />
                    <Option checked={includesOption(visit.householdDependency, "มีคนอายุ 15-65 ปีว่างงาน", ["คนอายุ 15-65 ปี ว่างงาน"])} label="มีคนอายุ 15-65 ปีว่างงาน (ที่ไม่ใช่นักเรียน/นักศึกษา)" width={208} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>4.2 ประเภทที่อยู่อาศัย ดังนี้</Text>
                    <Option checked={equalsOption(visit.housingType, "บ้านของตนเอง")} label="บ้านของตนเอง" type="circle" width={110} />
                    <Option checked={equalsOption(visit.housingType, "บ้านเช่า")} label="บ้านเช่า" type="circle" width={85} />
                    <Option checked={equalsOption(visit.housingType, "อาศัยอยู่กับผู้อื่น")} label="อาศัยอยู่กับผู้อื่น" type="circle" width={133} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>4.3 สภาพที่อยู่อาศัย ดังนี้</Text>
                    <Option checked={hasPoorHousingCondition} label="สภาพบ้านชำรุดทรุดโทรม หรือ บ้านทำจากวัสดุพื้นบ้าน เช่น ไม้ไผ่ ใบจากหรือวัสดุเหลือใช้" width={328} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel} />
                    <Option checked={hasNoToilet} label="ไม่มีห้องส้วมในที่อยู่อาศัยและบริเวณ" width={328} />
                </View>
                <View style={[styles.sectionRow, { marginTop: 4 }]}>
                    <Text style={styles.sectionLabel}>4.4 ยานพาหนะของครอบครัว</Text>
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.vehicleLabel}>- รถยนต์ส่วนบุคคล</Text>
                    <Option checked={equalsOption(visit.vehiclePrivateCar, "มี")} label="มี" type="circle" width={70} />
                    <Option checked={equalsOption(visit.vehiclePrivateCar, "ไม่มี")} label="ไม่มี" type="circle" width={70} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.vehicleLabel}>- รถปิกอัพ/รถบรรทุกเล็ก/รถตู้</Text>
                    <Option checked={equalsOption(visit.vehiclePickup, "มี")} label="มี" type="circle" width={70} />
                    <Option checked={equalsOption(visit.vehiclePickup, "ไม่มี")} label="ไม่มี" type="circle" width={70} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.vehicleLabel}>- รถไถ/รถเกี่ยวข้าว/รถเดินตาม/รถอื่นๆ ประเภทเดียวกัน</Text>
                    <Option checked={equalsOption(visit.vehicleFarmMachine, "มี")} label="มี" type="circle" width={70} />
                    <Option checked={equalsOption(visit.vehicleFarmMachine, "ไม่มี")} label="ไม่มี" type="circle" width={70} />
                </View>
                <View style={styles.sectionRow}>
                    <Text style={styles.sectionLabel}>4.5 เป็นเกษตรกร มีที่ดินทำกิน (รวมเช่า)</Text>
                    <Option checked={includesOption(visit.farmlandStatus, "ไม่เกิน 1 ไร่")} label="ไม่เกิน 1 ไร่" width={110} />
                    <Option checked={includesOption(visit.farmlandStatus, "ไม่มีที่ดินเป็นของตนเอง")} label="ไม่มีที่ดินเป็นของตนเอง" width={168} />
                </View>
            </View>
        </Page>
    );
};

export default Page1;
