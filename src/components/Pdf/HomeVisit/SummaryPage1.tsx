import React from 'react';
import { View, Text, Page } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';

interface SummaryPage1Props {
    schoolName: string;
    academicYear: string;
    semester: string;
    classLevel: string;
    room: string;
    visitStartDate: string;
    visitEndDate: string;
    stats: {
        totalStudents: number;
        visitedMale: number;
        visitedFemale: number;
        visitedTotal: number;
        notVisitedTotal: number;
        notVisitedReason: string;
        familyWarm: number;
        familyBroken: number;
        bothParentsDeceased: number;
        oneParentDeceased: number;
        parentsSeparated: number;
        notLivingWithParents: number;
        learningRisk: number;
        healthRisk: number;
        behaviorRisk: {
            health: number;
            drug: number;
            violence: number;
            travel: number;
            sexual: number;
            game: number;
            others: number;
        };
        riskTotal: number;
        economicRisk: number;
        otherRisk: number;
        otherRiskDetail: string;
    };
}

const SummaryPage1: React.FC<SummaryPage1Props> = ({
    schoolName, academicYear, semester, classLevel, room,
    visitStartDate, visitEndDate, stats
}) => {
    const s = (val: any) => (val === null || val === undefined) ? '' : String(val);

    const formatPercent = (count: number) => {
        const total = Number(stats?.totalStudents) || 1;
        const c = Number(count) || 0;
        return ((c / total) * 100).toFixed(2);
    };

    const formatGrade = (val: string) => {
        if (!val) return '....................';
        const clean = val.replace(/ชั้น|ม\.|ป\./g, '').trim();
        if (clean === "") return '....................';
        if (val.includes('ม.')) return `มัธยมศึกษาปีที่ ${clean}`;
        if (val.includes('ป.')) return `ประถมศึกษาปีที่ ${clean}`;
        return val;
    };

    const totalStudentsCount = Number(stats?.totalStudents) || 0;
    const visitedTotalCount = Number(stats?.visitedTotal) || 0;
    const notVisitedTotalCount = Number(stats?.notVisitedTotal) || 0;

    const visitedPercent = formatPercent(visitedTotalCount);
    const notVisitedPercent = formatPercent(notVisitedTotalCount);

    const dottedStyle = {
        borderBottomWidth: 0.5,
        borderBottomStyle: 'dashed' as const,
        borderBottomColor: '#000',
    };

    const dataValueStyle = (width: number | string = 60) => ([
        styles.text,
        dottedStyle,
        { width, textAlign: 'center' as const, marginLeft: 2, marginRight: 2 }
    ]);

    const rowStyle = { flexDirection: 'row' as const, alignItems: 'center' as const, marginBottom: 7 };

    return (
        <Page style={styles.page}>
            {/* Header Section */}
            <View style={{ marginBottom: 15, alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold' }}>แบบสรุปรายงานการเยี่ยมบ้านนักเรียน</Text>
                <Text style={{ marginTop: 4 }}>โรงเรียน{schoolName || '................................'}</Text>
                <Text style={{ marginTop: 2 }}>
                    ครั้งที่ {semester || '.....'} ปีการศึกษา {academicYear || '.........'} ระดับชั้น{formatGrade(classLevel)} ห้อง {room || '.....'}
                </Text>
                <Text style={{ marginTop: 2 }}>
                    ระหว่างวันที่ {visitStartDate || '................'} - {visitEndDate || '................'}
                </Text>
                <Text style={{ marginTop: 4 }}>********************************************************************************************************</Text>
            </View>

            {/* Points 1-4 */}
            <View style={rowStyle}>
                <Text style={styles.text}>1. จำนวนนักเรียนในห้องเรียน</Text>
                <Text style={dataValueStyle(60)}>{totalStudentsCount}</Text>
                <Text style={styles.text}>คน</Text>
            </View>

            <View style={rowStyle}>
                <Text style={styles.text}>2. จำนวนนักเรียนในห้องเรียนที่ออกเยี่ยมบ้าน</Text>
                <Text style={dataValueStyle(60)}>{visitedTotalCount}</Text>
                <Text style={styles.text}>คน ชาย</Text>
                <Text style={dataValueStyle(50)}>{Number(stats?.visitedMale) || 0}</Text>
                <Text style={styles.text}>คน / หญิง</Text>
                <Text style={dataValueStyle(50)}>{Number(stats?.visitedFemale) || 0}</Text>
                <Text style={styles.text}>คน</Text>
            </View>

            <View style={rowStyle}>
                <Text style={styles.text}>3. จำนวนนักเรียนที่ออกเยี่ยมบ้าน</Text>
                <Text style={dataValueStyle(60)}>{visitedTotalCount}</Text>
                <Text style={styles.text}>คน คิดเป็นร้อยละ</Text>
                <Text style={dataValueStyle(80)}>{visitedPercent}</Text>
            </View>

            <View style={rowStyle}>
                <Text style={styles.text}>4. จำนวนนักเรียนที่ไม่ได้ออกเยี่ยมบ้าน</Text>
                <Text style={dataValueStyle(60)}>{notVisitedTotalCount}</Text>
                <Text style={styles.text}>คน คิดเป็นร้อยละ</Text>
                <Text style={dataValueStyle(80)}>{notVisitedPercent}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={styles.text}>สาเหตุที่ไม่ได้ออกเยี่ยมบ้าน</Text>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.notVisitedReason)}</Text>
            </View>

            {/* Point 5 */}
            <View style={rowStyle}>
                <Text style={styles.text}>5. สภาพครอบครัวที่สถานศึกษาออกไปเยี่ยมบ้าน</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 35 }]}>
                <Text style={styles.text}>อบอุ่น จำนวน</Text>
                <Text style={dataValueStyle(60)}>{Number(stats?.familyWarm) || 0}</Text>
                <Text style={styles.text}>คน</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 35 }]}>
                <Text style={styles.text}>แตกแยก จำนวน</Text>
                <Text style={dataValueStyle(60)}>{Number(stats?.familyBroken) || 0}</Text>
                <Text style={styles.text}>คน</Text>
            </View>

            {/* Points 6-12 */}
            {[
                { label: '6. พบว่านักเรียนที่บิดาและมารดาเสียชีวิต', value: stats?.bothParentsDeceased },
                { label: '7. พบว่านักเรียนที่บิดาหรือมารดาเสียชีวิต', value: stats?.oneParentDeceased },
                { label: '8. พบว่านักเรียนที่บิดาและมารดาเลิกร้างกัน', value: stats?.parentsSeparated },
                { label: '9. พบว่านักเรียนมิได้อาศัยอยู่กับบิดาหรือมารดาของตนเอง', value: stats?.notLivingWithParents },
                { label: '10. พบว่านักเรียนเสี่ยงหรือมีปัญหาด้านการเรียน', value: stats?.learningRisk },
                { label: '11. พบว่านักเรียนมีปัญหาด้านสุขภาพ', value: stats?.healthRisk },
                { label: '12. พบว่านักเรียนมีพฤติกรรมเสี่ยง', value: stats?.riskTotal },
            ].map((item, idx) => (
                <View key={idx} style={rowStyle}>
                    <Text style={[styles.text, { width: 330 }]}>{item.label}</Text>
                    <Text style={styles.text}>จำนวน</Text>
                    <Text style={dataValueStyle(45)}>{Number(item.value) || 0}</Text>
                    <Text style={styles.text}>คน คิดเป็นร้อยละ</Text>
                    <Text style={dataValueStyle(70)}>{formatPercent(Number(item.value) || 0)}</Text>
                </View>
            ))}

            {/* Item 12 details */}
            <View style={[rowStyle, { marginLeft: 40, marginBottom: 4 }]}>
                <View style={{ width: '33%', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.text}>- สุขภาพ</Text>
                    <Text style={dataValueStyle(35)}>{Number(stats?.behaviorRisk?.health) || 0}</Text>
                    <Text style={styles.text}>คน</Text>
                </View>
                <View style={{ width: '33%', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.text}>- การใช้สารเสพติด</Text>
                    <Text style={dataValueStyle(35)}>{Number(stats?.behaviorRisk?.drug) || 0}</Text>
                    <Text style={styles.text}>คน</Text>
                </View>
                <View style={{ width: '33%', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.text}>- ความรุนแรง</Text>
                    <Text style={dataValueStyle(35)}>{Number(stats?.behaviorRisk?.violence) || 0}</Text>
                    <Text style={styles.text}>คน</Text>
                </View>
            </View>
            <View style={[rowStyle, { marginLeft: 40, marginBottom: 4 }]}>
                <View style={{ width: '33%', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.text}>- การเดินทางมาเรียน</Text>
                    <Text style={dataValueStyle(35)}>{Number(stats?.behaviorRisk?.travel) || 0}</Text>
                    <Text style={styles.text}>คน</Text>
                </View>
                <View style={{ width: '33%', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.text}>- ด้านเพศ</Text>
                    <Text style={dataValueStyle(35)}>{Number(stats?.behaviorRisk?.sexual) || 0}</Text>
                    <Text style={styles.text}>คน</Text>
                </View>
                <View style={{ width: '33%', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.text}>- การติดเกม</Text>
                    <Text style={dataValueStyle(35)}>{Number(stats?.behaviorRisk?.game) || 0}</Text>
                    <Text style={styles.text}>คน</Text>
                </View>
            </View>
            <View style={[rowStyle, { marginLeft: 40 }]}>
                <Text style={styles.text}>- อื่นๆ</Text>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{Number(stats?.behaviorRisk?.others) > 0 ? stats?.behaviorRisk?.others : ''}</Text>
            </View>

            {/* Item 13-14 */}
            <View style={[rowStyle, { marginTop: 4 }]}>
                <Text style={[styles.text, { width: 330 }]}>13. พบว่านักเรียนมีปัญหาด้านเศรษฐกิจ</Text>
                <Text style={styles.text}>จำนวน</Text>
                <Text style={dataValueStyle(45)}>{Number(stats?.economicRisk) || 0}</Text>
                <Text style={styles.text}>คน คิดเป็นร้อยละ</Text>
                <Text style={dataValueStyle(70)}>{formatPercent(Number(stats?.economicRisk) || 0)}</Text>
            </View>

            <View style={rowStyle}>
                <Text style={[styles.text, { width: 330 }]}>14. พบว่านักเรียนมีปัญหาด้านอื่นๆ</Text>
                <Text style={styles.text}>จำนวน</Text>
                <Text style={dataValueStyle(45)}>{Number(stats?.otherRisk) || 0}</Text>
                <Text style={styles.text}>คน คิดเป็นร้อยละ</Text>
                <Text style={dataValueStyle(70)}>{formatPercent(Number(stats?.otherRisk) || 0)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={styles.text}>ระบุปัญหาที่พบ</Text>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.otherRiskDetail)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>
        </Page>
    );
};

export default SummaryPage1;
