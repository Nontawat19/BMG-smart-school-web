import React from 'react';
import { Page, Text, View, Document, StyleSheet, Image, Font } from '@react-pdf/renderer';
import { parseStudentBirthDateParts } from '@/utils/birthDateUtils';

try {
    Font.register({
        family: 'TH Sarabun PSK',
        fonts: [
            { src: '/fonts/THSarabunNew.ttf' },
            { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
            { src: '/fonts/THSarabunNew Italic.ttf', fontStyle: 'italic' },
            { src: '/fonts/THSarabunNew BoldItalic.ttf', fontWeight: 'bold', fontStyle: 'italic' },
        ],
    });
} catch (e) {
    console.error("Font registration failed in PorBor7GradeDocument", e);
}

const page = {
    width: 595.28,
    height: 841.89,
};

const styles = StyleSheet.create({
    page: {
        position: 'relative',
        padding: 0,
        fontFamily: 'TH Sarabun PSK',
        color: '#000',
        fontSize: 10.6,
        lineHeight: 1,
    },
    formCode: {
        position: 'absolute',
        top: 20,
        right: 29,
        fontSize: 12,
        fontWeight: 'bold',
    },
    refNo: {
        position: 'absolute',
        top: 72,
        left: 29,
        flexDirection: 'row',
        alignItems: 'flex-end',
        fontSize: 11,
    },
    krut: {
        position: 'absolute',
        top: 14,
        left: 270,
        width: 54,
        height: 66,
        objectFit: 'contain',
    },
    title: {
        position: 'absolute',
        top: 91,
        left: 0,
        width: page.width,
        textAlign: 'center',
        fontSize: 16,
        fontWeight: 'bold',
    },
    infoArea: {
        position: 'absolute',
        top: 113,
        left: 29,
        width: 537,
    },
    infoRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        height: 14,
    },
    label: {
        fontSize: 10.6,
        lineHeight: 1,
        paddingBottom: 2,
    },
    valueLine: {
        height: 12,
        borderBottomWidth: 0.45,
        borderBottomColor: '#d7d7d7',
        borderBottomStyle: 'solid',
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: 1,
    },
    value: {
        fontSize: 10.4,
        lineHeight: 1,
    },
    valueBold: {
        fontSize: 10.4,
        lineHeight: 1,
        fontWeight: 'bold',
    },
    tableIntro: {
        position: 'absolute',
        top: 201,
        left: 29,
        fontSize: 11.3,
        lineHeight: 1,
    },
    table: {
        position: 'absolute',
        top: 207,
        left: 23,
        width: 549,
        height: 515,
        borderWidth: 0.8,
        borderColor: '#000',
        borderStyle: 'solid',
        flexDirection: 'row',
    },
    panel: {
        width: 183,
        height: 515,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    panelLast: {
        width: 183,
        height: 515,
    },
    panelHeader: {
        height: 43,
        flexDirection: 'row',
        position: 'relative',
        borderBottomWidth: 0.8,
        borderBottomColor: '#000',
        borderBottomStyle: 'solid',
    },
    subjectHeader: {
        width: 132,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hourHeader: {
        width: 26,
        alignItems: 'center',
        justifyContent: 'center',
    },
    gradeHeader: {
        width: 25,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerSubjectDivider: {
        position: 'absolute',
        top: 0,
        left: 132,
        height: 43,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    headerHourDivider: {
        position: 'absolute',
        top: 0,
        left: 158,
        height: 43,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    verticalText: {
        fontSize: 8.5,
        lineHeight: 1,
        transform: 'rotate(270deg)',
    },
    headerText: {
        fontSize: 10.2,
        lineHeight: 1,
    },
    panelBody: {
        height: 472,
        position: 'relative',
        flexDirection: 'column',
    },
    bodySubjectDivider: {
        position: 'absolute',
        top: 0,
        left: 132,
        height: 472,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    bodyHourDivider: {
        position: 'absolute',
        top: 0,
        left: 158,
        height: 472,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    subjectBody: {
        width: 132,
        paddingTop: 4,
        paddingLeft: 3,
        paddingRight: 3,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    hourBody: {
        width: 26,
        paddingTop: 4,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    gradeBody: {
        width: 25,
        paddingTop: 4,
    },
    yearTitle: {
        fontSize: 10,
        fontWeight: 'bold',
        lineHeight: 1.05,
    },
    sectionSpacer: {
        height: 21,
    },
    groupTitle: {
        fontSize: 9.8,
        lineHeight: 1.05,
    },
    courseRow: {
        height: 12,
        justifyContent: 'center',
    },
    alignedRow: {
        height: 12,
        flexDirection: 'row',
    },
    titleAlignedRow: {
        height: 31,
        flexDirection: 'row',
    },
    fillerAlignedRow: {
        flex: 1,
        flexDirection: 'row',
    },
    subjectCell: {
        width: 132,
        paddingLeft: 3,
        paddingRight: 3,
        justifyContent: 'center',
    },
    hourCell: {
        width: 26,
        justifyContent: 'center',
    },
    gradeCell: {
        width: 25,
        justifyContent: 'center',
    },
    courseText: {
        fontSize: 8.7,
        lineHeight: 1,
    },
    courseTextSmall: {
        fontSize: 8,
        lineHeight: 1,
    },
    numberText: {
        fontSize: 8.8,
        lineHeight: 1,
        textAlign: 'center',
    },
    averageText: {
        fontSize: 8.8,
        lineHeight: 1,
        textAlign: 'right',
        fontWeight: 'bold',
    },
    boldNumberText: {
        fontSize: 8.8,
        lineHeight: 1,
        textAlign: 'center',
        fontWeight: 'bold',
    },
    totalRow: {
        height: 12,
        marginTop: 2,
        justifyContent: 'center',
    },
    summaryBox: {
        position: 'absolute',
        top: 590,
        left: 389,
        width: 183,
        height: 132,
        borderWidth: 0.8,
        borderColor: '#000',
        borderStyle: 'solid',
        borderLeftWidth: 0,
        backgroundColor: '#fff',
    },
    summaryContent: {
        position: 'relative',
        flexDirection: 'row',
        height: 118,
    },
    summarySubject: {
        width: 132,
        paddingTop: 4,
        paddingLeft: 3,
    },
    summaryHour: {
        width: 26,
        paddingTop: 4,
    },
    summaryGrade: {
        width: 25,
        paddingTop: 4,
    },
    summaryBottom: {
        height: 14,
        flexDirection: 'row',
        position: 'relative',
        borderTopWidth: 0.8,
        borderTopColor: '#000',
        borderTopStyle: 'solid',
    },
    summarySubjectDivider: {
        position: 'absolute',
        top: 0,
        left: 132,
        height: 118,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    summaryHourDivider: {
        position: 'absolute',
        top: 0,
        left: 158,
        height: 118,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    summaryBottomSubjectDivider: {
        position: 'absolute',
        top: 0,
        left: 132,
        height: 14,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    summaryBottomHourDivider: {
        position: 'absolute',
        top: 0,
        left: 158,
        height: 14,
        borderRightWidth: 0.8,
        borderRightColor: '#000',
        borderRightStyle: 'solid',
    },
    issueText: {
        position: 'absolute',
        top: 743,
        left: 0,
        width: page.width,
        textAlign: 'center',
        fontSize: 10.8,
    },
    photoText: {
        position: 'absolute',
        top: 778,
        left: 68,
        width: 70,
        fontSize: 8.8,
    },
    photoContainer: {
        position: 'absolute',
        top: 729,
        left: 57,
        width: 78,
        height: 102,
        borderWidth: 0.8,
        borderColor: '#000',
        borderStyle: 'solid',
        backgroundColor: '#fff',
    },
    studentPhoto: {
        width: '100%',
        height: '100%',
        objectFit: 'cover',
    },
    registrar: {
        position: 'absolute',
        top: 786,
        left: 185,
        width: 190,
        alignItems: 'center',
    },
    principal: {
        position: 'absolute',
        top: 806,
        right: 23,
        width: 175,
        alignItems: 'center',
    },
    signText: {
        fontSize: 9.7,
        lineHeight: 1.05,
    },
    note: {
        position: 'absolute',
        top: 810,
        left: 157,
        width: 270,
        fontSize: 9.5,
        textAlign: 'center',
    },
});

export interface GradeItem {
    courseCode: string;
    courseTitle: string;
    credit: number;
    grade: string | number;
    academicYear?: string;
    semester?: string;
    classLevel?: string;
    subjectGroup?: string;
    type?: string;
    courseType?: string;
}

interface PorBor7GradeProps {
    student: any;
    schoolInfo: any;
    academicYear: string;
    semester: string;
    grades: GradeItem[];
    issueDate: {
        day: number;
        month: string;
        year: number;
    };
    principalName: string;
    principalPosition?: string;
    headOfDeptName?: string;
    headOfDeptPosition?: string;
    refNo?: string;
}

const subjectGroups = [
    'ภาษาไทย',
    'คณิตศาสตร์',
    'วิทยาศาสตร์และเทคโนโลยี',
    'สังคมศึกษา ศาสนาและวัฒนธรรม',
    'สุขศึกษาและพลศึกษา',
    'ศิลปะ',
    'การงานอาชีพ',
    'ภาษาต่างประเทศ',
    'การศึกษาค้นคว้าด้วยตนเอง(IS)',
    'กลุ่มสาระค้นคว้า',
];

const thaiMonths = [
    '',
    'มกราคม',
    'กุมภาพันธ์',
    'มีนาคม',
    'เมษายน',
    'พฤษภาคม',
    'มิถุนายน',
    'กรกฎาคม',
    'สิงหาคม',
    'กันยายน',
    'ตุลาคม',
    'พฤศจิกายน',
    'ธันวาคม',
];

const toNumber = (value: string | number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
};

const formatGrade = (value: string | number) => {
    const parsed = toNumber(value);
    return parsed === null ? String(value || '-') : parsed.toFixed(parsed % 1 === 0 ? 0 : 1);
};

const formatAverage = (value: number | null) => value === null ? '-' : value.toFixed(2);

const getStudyHours = (item: GradeItem, isPrimary: boolean) => {
    const credit = Number(item.credit || 0);
    const weeks = isPrimary ? 40 : 20;
    return credit * 2 * weeks;
};

const formatStudyHours = (value: number) => (
    Number.isInteger(value) ? value.toLocaleString('th-TH') : value.toLocaleString('th-TH', { maximumFractionDigits: 1 })
);

const getWeightedAverage = (items: GradeItem[]) => {
    const weighted = items.reduce((sum, item) => {
        const grade = toNumber(item.grade);
        return grade === null ? sum : sum + (Number(item.credit || 0) * grade);
    }, 0);
    const hours = items.reduce((sum, item) => toNumber(item.grade) === null ? sum : sum + Number(item.credit || 0), 0);
    return hours > 0 ? weighted / hours : null;
};

const getClassLevelParts = (classLevel?: string, room?: string) => {
    const raw = classLevel || '';
    const isPrimary = raw.startsWith('ป') || raw.includes('ประถม');
    const prefix = isPrimary ? 'ประถมศึกษาปีที่' : 'มัธยมศึกษาปีที่';
    const value = raw.replace(/^(ป|ม)\.?\s?/, '').replace(/[^\d/]/g, '') || raw.replace(/[^\d/]/g, '');
    const level = room && value && !value.includes('/') ? `${value}/${room}` : value;
    return { prefix, level, gradeNumber: Number((value || '').split('/')[0]) || 6 };
};

const normalizeGender = (value?: string, title?: string) => {
    const raw = String(value || '').trim();
    if (raw === 'ช' || raw === 'ชาย' || raw.toLowerCase() === 'male') return 'ชาย';
    if (raw === 'ญ' || raw === 'หญิง' || raw.toLowerCase() === 'female') return 'หญิง';
    if (String(title || '').includes('เด็กชาย') || String(title || '').includes('นาย')) return 'ชาย';
    return 'หญิง';
};

const getCourseTitle = (item: GradeItem) => {
    const title = item.courseTitle || '';
    return title.replace(/^รายวิชา\s*/, '').trim();
};

const getCourseGroup = (item: GradeItem) => {
    if (item.subjectGroup) {
        const group = item.subjectGroup;
        if (group.includes('ไทย')) return 'ภาษาไทย';
        if (group.includes('คณิต')) return 'คณิตศาสตร์';
        if (group.includes('วิทยา') || group.includes('เทคโน')) return 'วิทยาศาสตร์และเทคโนโลยี';
        if (group.includes('สังคม') || group.includes('ประวัติ')) return 'สังคมศึกษา ศาสนาและวัฒนธรรม';
        if (group.includes('สุข') || group.includes('พลศึกษา')) return 'สุขศึกษาและพลศึกษา';
        if (group.includes('ศิลป')) return 'ศิลปะ';
        if (group.includes('งาน') || group.includes('อาชีพ')) return 'การงานอาชีพ';
        if (group.includes('อังกฤษ') || group.includes('ต่างประเทศ')) return 'ภาษาต่างประเทศ';
        if (group.includes('ค้นคว้า')) return 'การศึกษาค้นคว้าด้วยตนเอง(IS)';
        return group;
    }
    const title = item.courseTitle || '';
    if (title.includes('ไทย')) return 'ภาษาไทย';
    if (title.includes('คณิต')) return 'คณิตศาสตร์';
    if (title.includes('วิทยา') || title.includes('เทคโน')) return 'วิทยาศาสตร์และเทคโนโลยี';
    if (title.includes('สังคม') || title.includes('ประวัติ')) return 'สังคมศึกษา ศาสนาและวัฒนธรรม';
    if (title.includes('สุข') || title.includes('พลศึกษา')) return 'สุขศึกษาและพลศึกษา';
    if (title.includes('ศิลป')) return 'ศิลปะ';
    if (title.includes('งาน') || title.includes('อาชีพ')) return 'การงานอาชีพ';
    if (title.includes('อังกฤษ') || title.includes('ต่างประเทศ')) return 'ภาษาต่างประเทศ';
    if (title.includes('ค้นคว้า')) return 'กลุ่มสาระค้นคว้า';
    return 'การศึกษาค้นคว้าด้วยตนเอง(IS)';
};

const getCourseType = (item: GradeItem) => {
    const rawType = String(item.type || item.courseType || '').trim();
    const lowerType = rawType.toLowerCase();
    if (rawType.includes('เพิ่มเติม') || lowerType === 'additional') return 'เพิ่มเติม';
    if (rawType.includes('พื้นฐาน') || lowerType === 'basic') return 'พื้นฐาน';
    return '';
};

const InfoField = ({
    children,
    width,
    bold = false,
}: {
    children: React.ReactNode;
    width: number;
    bold?: boolean;
}) => (
    <View style={[styles.valueLine, { width }]}>
        <Text style={bold ? styles.valueBold : styles.value}>{children}</Text>
    </View>
);

const CourseList = ({ items }: { items: GradeItem[] }) => (
    <>
        <Text style={styles.groupTitle}>รายวิชาพื้นฐาน</Text>
        {items.slice(0, 9).map((item, index) => (
            <View style={styles.courseRow} key={`${item.courseCode}-${index}`}>
                <Text style={getCourseTitle(item).length > 24 ? styles.courseTextSmall : styles.courseText}>
                    {item.courseCode} {getCourseTitle(item)}
                </Text>
            </View>
        ))}
        {items.length > 9 && <Text style={[styles.groupTitle, { marginTop: 2 }]}>รายวิชาเพิ่มเติม</Text>}
        {items.slice(9, 12).map((item, index) => (
            <View style={styles.courseRow} key={`${item.courseCode}-extra-${index}`}>
                <Text style={getCourseTitle(item).length > 24 ? styles.courseTextSmall : styles.courseText}>
                    {item.courseCode} {getCourseTitle(item)}
                </Text>
            </View>
        ))}
    </>
);

const NumberList = ({ items, type, isPrimary }: { items: GradeItem[]; type: 'hours' | 'grade'; isPrimary: boolean }) => (
    <>
        <Text style={styles.groupTitle}> </Text>
        {items.slice(0, 9).map((item, index) => (
            <View style={styles.courseRow} key={`${type}-${item.courseCode}-${index}`}>
                <Text style={styles.numberText}>{type === 'hours' ? formatStudyHours(getStudyHours(item, isPrimary)) : formatGrade(item.grade)}</Text>
            </View>
        ))}
        {items.length > 9 && <Text style={[styles.groupTitle, { marginTop: 2 }]}> </Text>}
        {items.slice(9, 12).map((item, index) => (
            <View style={styles.courseRow} key={`${type}-${item.courseCode}-extra-${index}`}>
                <Text style={styles.numberText}>{type === 'hours' ? formatStudyHours(getStudyHours(item, isPrimary)) : formatGrade(item.grade)}</Text>
            </View>
        ))}
    </>
);

const buildDisplayRows = (items: GradeItem[]) => {
    const rows: Array<{ type: 'heading' | 'course'; item?: GradeItem; label?: string }> = [
        { type: 'heading', label: 'รายวิชาพื้นฐาน' },
    ];
    const hasCourseTypes = items.some(item => getCourseType(item));
    const basicItems = hasCourseTypes
        ? items.filter(item => getCourseType(item) !== 'เพิ่มเติม')
        : items.slice(0, 9);
    const additionalItems = hasCourseTypes
        ? items.filter(item => getCourseType(item) === 'เพิ่มเติม')
        : items.slice(9, 12);

    basicItems.forEach(item => rows.push({ type: 'course', item }));

    if (additionalItems.length > 0) {
        rows.push({ type: 'heading', label: 'รายวิชาเพิ่มเติม' });
        additionalItems.forEach(item => rows.push({ type: 'course', item }));
    }

    return rows;
};

const PanelSection = ({
    title,
    items,
    height,
    isPrimary,
    paddingTop = 4,
}: {
    title: string;
    items: GradeItem[];
    height: number;
    isPrimary: boolean;
    paddingTop?: number;
}) => {
    const rows = buildDisplayRows(items);
    const totalHours = items.reduce((sum, item) => sum + getStudyHours(item, isPrimary), 0);

    return (
        <View style={{ height, paddingTop }}>
            <View style={styles.titleAlignedRow}>
                <View style={styles.subjectCell}>
                    <Text style={styles.yearTitle}>{title}</Text>
                </View>
                <View style={styles.hourCell} />
                <View style={styles.gradeCell} />
            </View>

            {rows.map((row, index) => (
                <View style={styles.alignedRow} key={`${row.type}-${row.item?.courseCode || row.label || index}`}>
                    <View style={styles.subjectCell}>
                        {row.type === 'heading' ? (
                            <Text style={styles.groupTitle}>{row.label}</Text>
                        ) : (
                            <Text style={getCourseTitle(row.item!).length > 24 ? styles.courseTextSmall : styles.courseText}>
                                {row.item?.courseCode} {getCourseTitle(row.item!)}
                            </Text>
                        )}
                    </View>
                    <View style={styles.hourCell}>
                        <Text style={styles.numberText}>
                            {row.type === 'course' ? formatStudyHours(getStudyHours(row.item!, isPrimary)) : ''}
                        </Text>
                    </View>
                    <View style={styles.gradeCell}>
                        <Text style={styles.numberText}>
                            {row.type === 'course' ? formatGrade(row.item!.grade) : ''}
                        </Text>
                    </View>
                </View>
            ))}

            {items.length > 0 && (
                <View style={styles.alignedRow}>
                    <View style={styles.subjectCell}>
                        <Text style={styles.averageText}>ผลการเรียนเฉลี่ย</Text>
                    </View>
                    <View style={styles.hourCell}>
                        <Text style={styles.boldNumberText}>{formatStudyHours(totalHours)}</Text>
                    </View>
                    <View style={styles.gradeCell}>
                        <Text style={styles.boldNumberText}>{formatAverage(getWeightedAverage(items))}</Text>
                    </View>
                </View>
            )}

            <View style={styles.fillerAlignedRow}>
                <View style={styles.subjectCell} />
                <View style={styles.hourCell} />
                <View style={styles.gradeCell} />
            </View>
        </View>
    );
};

const PanelColumnSection = ({
    title,
    items,
    height,
    isPrimary,
    column,
    paddingTop,
}: {
    title: string;
    items: GradeItem[];
    height: number;
    isPrimary: boolean;
    column: 'subject' | 'hours' | 'grade';
    paddingTop: number;
}) => {
    const rows = buildDisplayRows(items);

    return (
        <View style={{ paddingTop, paddingLeft: column === 'subject' ? 3 : 0, paddingRight: column === 'subject' ? 3 : 0, height }}>
            <Text style={styles.yearTitle}>{column === 'subject' ? title : ' '}</Text>
            {rows.map((row, index) => {
                if (row.type === 'heading') {
                    return (
                        <View style={styles.courseRow} key={`${column}-heading-${index}`}>
                            <Text style={column === 'subject' ? styles.groupTitle : styles.numberText}>{column === 'subject' ? row.label : ''}</Text>
                        </View>
                    );
                }

                return (
                    <View style={styles.courseRow} key={`${column}-course-${row.item?.courseCode || index}`}>
                        {column === 'subject' ? (
                            <Text style={getCourseTitle(row.item!).length > 24 ? styles.courseTextSmall : styles.courseText}>
                                {row.item?.courseCode} {getCourseTitle(row.item!)}
                            </Text>
                        ) : (
                            <Text style={styles.numberText}>
                                {column === 'hours' ? formatStudyHours(getStudyHours(row.item!, isPrimary)) : formatGrade(row.item!.grade)}
                            </Text>
                        )}
                    </View>
                );
            })}
            {items.length > 0 && (
                <View style={styles.totalRow}>
                    {column === 'subject' ? (
                        <Text style={styles.averageText}>ผลการเรียนเฉลี่ย</Text>
                    ) : (
                        <Text style={styles.boldNumberText}>
                            {column === 'hours'
                                ? formatStudyHours(items.reduce((sum, item) => sum + getStudyHours(item, isPrimary), 0))
                                : formatAverage(getWeightedAverage(items))}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
};

type GradePanelSlot = {
    title: string;
    items: GradeItem[];
};

const GradePanel = ({
    title,
    items,
    secondTitle,
    secondItems = [],
    isPrimary,
    last = false,
}: {
    title: string;
    items: GradeItem[];
    secondTitle?: string;
    secondItems?: GradeItem[];
    isPrimary: boolean;
    last?: boolean;
}) => {
    const firstSectionHeight = last ? 340 : secondTitle ? 236 : 472;
    const secondSectionHeight = 236;

    return (
        <View style={last ? styles.panelLast : styles.panel}>
            <View style={styles.panelHeader}>
                <View style={styles.headerSubjectDivider} />
                <View style={styles.headerHourDivider} />
                <View style={styles.subjectHeader}><Text style={styles.headerText}>รหัส/รายวิชา</Text></View>
                <View style={styles.hourHeader}><Text style={styles.verticalText}>เวลา(ชั่วโมง)</Text></View>
                <View style={styles.gradeHeader}><Text style={styles.verticalText}>ผลการเรียน</Text></View>
            </View>
            <View style={styles.panelBody}>
                <View style={styles.bodySubjectDivider} />
                <View style={styles.bodyHourDivider} />
                <PanelSection title={title} items={items} height={firstSectionHeight} isPrimary={isPrimary} paddingTop={4} />
                {secondTitle && (
                    <PanelSection title={secondTitle} items={secondItems} height={secondSectionHeight} isPrimary={isPrimary} paddingTop={0} />
                )}
            </View>
        </View>
    );
};

const SummaryBox = ({ items, isPrimary }: { items: GradeItem[]; isPrimary: boolean }) => {
    const summary = subjectGroups.map(group => {
        const groupItems = items.filter(item => getCourseGroup(item) === group);
        const hours = groupItems.reduce((sum, item) => sum + getStudyHours(item, isPrimary), 0);
        return {
            group,
            hours,
            average: getWeightedAverage(groupItems),
        };
    }).filter(item => item.hours > 0);

    const rows = summary.length > 0 ? summary : subjectGroups.slice(0, 10).map(group => ({ group, hours: 0, average: null }));
    const totalHours = rows.reduce((sum, item) => sum + item.hours, 0);
    const average = getWeightedAverage(items);

    return (
        <View style={styles.summaryBox}>
            <View style={styles.summaryContent}>
                <View style={styles.summarySubjectDivider} />
                <View style={styles.summaryHourDivider} />
                <View style={styles.summarySubject}>
                    {rows.slice(0, 10).map(item => <Text style={styles.courseText} key={item.group}>{item.group}</Text>)}
                </View>
                <View style={styles.summaryHour}>
                    {rows.slice(0, 10).map(item => <Text style={styles.numberText} key={item.group}>{item.hours ? formatStudyHours(item.hours) : ''}</Text>)}
                </View>
                <View style={styles.summaryGrade}>
                    {rows.slice(0, 10).map(item => <Text style={styles.numberText} key={item.group}>{item.average === null ? '' : formatAverage(item.average)}</Text>)}
                </View>
            </View>
            <View style={styles.summaryBottom}>
                <View style={styles.summaryBottomSubjectDivider} />
                <View style={styles.summaryBottomHourDivider} />
                <View style={[styles.summarySubject, { height: 14, paddingTop: 2 }]}><Text style={styles.courseText}>ผลการเรียนเฉลี่ย</Text></View>
                <View style={[styles.summaryHour, { height: 14, paddingTop: 2 }]}><Text style={styles.numberText}>{totalHours ? formatStudyHours(totalHours) : ''}</Text></View>
                <View style={[styles.summaryGrade, { height: 14, paddingTop: 2 }]}><Text style={styles.numberText}>{formatAverage(average)}</Text></View>
            </View>
        </View>
    );
};

const getSecondarySemesterSlots = (currentYear: number, currentLevel: number, currentSemester: number) => {
    const currentAbsoluteTerm = ((currentLevel - 1) * 2) + currentSemester;

    return Array.from({ length: 5 }, (_, index) => {
        const offset = index - 4;
        const absoluteTerm = currentAbsoluteTerm + offset;
        const level = Math.max(1, Math.ceil(absoluteTerm / 2));
        const semester = ((absoluteTerm - 1) % 2) + 1;

        let year = currentYear;
        let sem = currentSemester;
        for (let step = 0; step < Math.abs(offset); step += 1) {
            sem -= 1;
            if (sem < 1) {
                sem = 2;
                year -= 1;
            }
        }

        return { year, level, semester };
    });
};

const PorBor7GradeDocument: React.FC<PorBor7GradeProps> = ({
    student,
    schoolInfo,
    academicYear,
    semester,
    grades,
    issueDate,
    principalName,
    principalPosition = "ผู้อำนวยการโรงเรียน",
    headOfDeptName = "นายทะเบียน",
    refNo = "",
}) => {
    const fullName = `${student.title || ''}${student.firstName || ''} ${student.lastName || ''}`.trim();
    const fatherFullName = student.fatherFirstName
        ? `${student.fatherTitle || ''}${student.fatherFirstName} ${student.fatherLastName || ''}`.trim()
        : '';
    const motherFullName = student.motherFirstName
        ? `${student.motherTitle || ''}${student.motherFirstName} ${student.motherLastName || ''}`.trim()
        : '';
    const birthDateParts = parseStudentBirthDateParts(student.birthDate);
    const birthDay = birthDateParts?.day || '';
    const birthMonth = birthDateParts?.month ? thaiMonths[birthDateParts.month] : '';
    const birthYear = birthDateParts ? (birthDateParts.year >= 2400 ? birthDateParts.year : birthDateParts.year + 543) : '';
    const { prefix, level, gradeNumber } = getClassLevelParts(student.classLevel, student.room);
    const currentYear = Number(academicYear) || issueDate.year;
    const isPrimary = String(student.classLevel || '').startsWith('ป') || String(student.classLevel || '').includes('ประถม');
    const currentLevel = Math.max(1, Math.min(6, gradeNumber || 6));
    const currentSemester = String(semester || '1') === '2' ? 2 : 1;
    const rawSchoolName = schoolInfo?.schoolName || '';
    const schoolName = rawSchoolName.startsWith('โรงเรียน') ? rawSchoolName.replace(/^โรงเรียน/, '') : rawSchoolName;
    const district = schoolInfo?.subdistrict || schoolInfo?.district || '';
    const amphoe = schoolInfo?.district || schoolInfo?.amphoe || '';
    const province = schoolInfo?.province || '';
    const educationArea = schoolInfo?.educationArea || schoolInfo?.educationalServiceArea || `สำนักงานเขตพื้นที่การศึกษา ประถมศึกษา${province || '........'} เขต 2`;
    const citizenId = student.idCardNumber || student.citizenId || '';
    const nationality = student.nationality || 'ไทย';
    const religion = student.religion || 'พุทธ';
    const gender = normalizeGender(student.gender, student.title);
    const issueDateText = `หนังสือรับรองนี้ออกให้ ณ วันที่ ${issueDate.day} เดือน ${issueDate.month} พ.ศ. ${issueDate.year}`;
    const studentPhotoSrc = student.profileImageDataUrl || student.profileImageUrl || '';
    const panels: GradePanelSlot[] = isPrimary
        ? Array.from({ length: 5 }, (_, index) => {
            const offset = index - 4;
            const year = currentYear + offset;
            const slotLevel = currentLevel + offset;
            const hasValidLevel = slotLevel >= 1 && slotLevel <= 6;
            return {
                title: hasValidLevel ? `ปีการศึกษา ${year} ชั้นประถมศึกษาปีที่ ${slotLevel}` : '',
                items: hasValidLevel ? grades.filter(item => Number(item.academicYear) === year) : [],
            };
        })
        : getSecondarySemesterSlots(currentYear, currentLevel, currentSemester).map(slot => ({
            title: `ปีการศึกษา ${slot.year} ชั้นมัธยมศึกษาปีที่ ${slot.level} ภาคเรียนที่ ${slot.semester}`,
            items: grades.filter(item => Number(item.academicYear) === slot.year && String(item.semester || '') === String(slot.semester)),
        }));
    const panelGradeItems = panels.flatMap(panel => panel.items);

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <Text style={styles.formCode}>ปพ.7</Text>
                <Image src="/assets/images/garuda_official.jpg" style={styles.krut} />
                <View style={styles.refNo}>
                    <Text style={[styles.label, { fontWeight: 'bold' }]}>เลขที่</Text>
                    <Text style={[styles.value, { marginLeft: 6 }]}>{refNo || '001/2569'}</Text>
                </View>
                <Text style={styles.title}>ใบรับรองผลการเรียน</Text>

                <View style={styles.infoArea}>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>ขอรับรองว่า</Text>
                        <InfoField width={150} bold>{fullName}</InfoField>
                        <Text style={[styles.label, { marginLeft: 20 }]}>เลขบัตรประจำตัวประชาชน</Text>
                        <InfoField width={82}>{citizenId}</InfoField>
                        <Text style={[styles.label, { marginLeft: 14 }]}>เลขประจำตัวนักเรียน</Text>
                        <InfoField width={43}>{student.studentId || ''}</InfoField>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>เป็นนักเรียนของโรงเรียน</Text>
                        <InfoField width={250} bold>{schoolName}</InfoField>
                        <Text style={[styles.label, { marginLeft: 54 }]}>แขวง/ตำบล</Text>
                        <InfoField width={83}>{district}</InfoField>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>เขต/อำเภอ</Text>
                        <InfoField width={100}>{amphoe}</InfoField>
                        <Text style={[styles.label, { marginLeft: 22 }]}>จังหวัด</Text>
                        <InfoField width={92}>{province}</InfoField>
                        <Text style={[styles.label, { marginLeft: 40 }]}>สำนักงานเขตพื้นที่การศึกษา</Text>
                        <InfoField width={141}>{educationArea.replace(/^สำนักงานเขตพื้นที่การศึกษา\s*/, '')}</InfoField>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>เกิดวันที่</Text>
                        <InfoField width={35}>{birthDay}</InfoField>
                        <Text style={[styles.label, { marginLeft: 12 }]}>เดือน</Text>
                        <InfoField width={72}>{birthMonth}</InfoField>
                        <Text style={[styles.label, { marginLeft: 15 }]}>พ.ศ.</Text>
                        <InfoField width={50}>{birthYear}</InfoField>
                        <Text style={[styles.label, { marginLeft: 20 }]}>เพศ</Text>
                        <InfoField width={48}>{gender}</InfoField>
                        <Text style={[styles.label, { marginLeft: 20 }]}>สัญชาติ</Text>
                        <InfoField width={48}>{nationality}</InfoField>
                        <Text style={[styles.label, { marginLeft: 20 }]}>ศาสนา</Text>
                        <InfoField width={56}>{religion}</InfoField>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>ชื่อ-ชื่อสกุลบิดา</Text>
                        <InfoField width={182}>{fatherFullName}</InfoField>
                        <Text style={[styles.label, { marginLeft: 60 }]}>ชื่อ-ชื่อสกุลมารดา</Text>
                        <InfoField width={210}>{motherFullName}</InfoField>
                    </View>
                    <View style={styles.infoRow}>
                        <Text style={styles.label}>ปัจจุบันกำลังเรียนอยู่ ชั้น{prefix}</Text>
                        <InfoField width={24} bold>{level}</InfoField>
                        <Text style={[styles.label, { marginLeft: 3 }]}>โดยมีรายวิชาและผลการเรียน พร้อมทั้งระดับคะแนนเฉลี่ยสะสม ดังนี้</Text>
                    </View>
                </View>

                <Text style={styles.tableIntro}> </Text>

                <View style={styles.table}>
                    <GradePanel title={panels[0].title} items={panels[0].items} secondTitle={panels[1].title} secondItems={panels[1].items} isPrimary={isPrimary} />
                    <GradePanel title={panels[2].title} items={panels[2].items} secondTitle={panels[3].title} secondItems={panels[3].items} isPrimary={isPrimary} />
                    <GradePanel title={panels[4].title} items={panels[4].items} isPrimary={isPrimary} last />
                </View>
                <SummaryBox items={panelGradeItems.length ? panelGradeItems : grades} isPrimary={isPrimary} />

                <Text style={styles.issueText}>{issueDateText}</Text>
                <View style={styles.photoContainer}>
                    {studentPhotoSrc ? <Image src={studentPhotoSrc} style={styles.studentPhoto} /> : null}
                </View>
                <View style={styles.registrar}>
                    <Text style={styles.signText}>( {headOfDeptName} )</Text>
                    <Text style={styles.signText}>นายทะเบียน</Text>
                </View>
                <Text style={styles.note}>หมายเหตุ หนังสือรับรองฉบับนี้มีอายุ 30 วัน นับตั้งแต่วันที่ออกให้</Text>
                <View style={styles.principal}>
                    <Text style={styles.signText}>( {principalName} )</Text>
                    <Text style={styles.signText}>{principalPosition}</Text>
                </View>
            </Page>
        </Document>
    );
};

export default PorBor7GradeDocument;
