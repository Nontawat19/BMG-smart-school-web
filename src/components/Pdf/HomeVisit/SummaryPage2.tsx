import React from 'react';
import { View, Text, Page } from '@react-pdf/renderer';
<<<<<<< HEAD
import { getCurrentThaiYear } from '@/utils/dateUtils';
=======
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
import { styles } from './HomeVisitPdfStyles';
import { formatFullTitle } from './utils';
import { Teacher } from './types';

interface SummaryPage2Props {
    stats: {
        totalStudents: number;
        urgentTotal: number;
        urgentDetail: string;
        agenciesJoined: string;
        dataUsage: string;
        parentConcernsSummary: string;
        obstaclesSummary: string;
        suggestionsSummary: string;
    };
    teacherName: string;
    teachers?: Teacher[];
}

const SummaryPage2: React.FC<SummaryPage2Props> = ({ stats, teacherName, teachers }) => {
    const s = (val: any) => (val === null || val === undefined) ? '' : String(val);

    const formatPercent = (count: number) => {
        const total = Number(stats?.totalStudents) || 1;
        const c = Number(count) || 0;
        return ((c / total) * 100).toFixed(2);
    };

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

    const getThaiDate = () => {
        const today = new Date();
        const thaiMonths = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
<<<<<<< HEAD
        return `${today.getDate()} ${thaiMonths[today.getMonth()]} พ.ศ. ${getCurrentThaiYear()}`;
=======
        return `${today.getDate()} ${thaiMonths[today.getMonth()]} พ.ศ. ${today.getFullYear() + 543}`;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
    };

    const thaiDate = getThaiDate();

    return (
        <Page style={styles.page}>
            {/* Point 15 */}
            <View style={rowStyle}>
                <Text style={[styles.text, { width: 330 }]}>15. พบว่านักเรียนต้องการความช่วยเหลือเร่งด่วน</Text>
                <Text style={styles.text}>จำนวน</Text>
                <Text style={dataValueStyle(45)}>{Number(stats?.urgentTotal) || 0}</Text>
                <Text style={styles.text}>คน คิดเป็นร้อยละ</Text>
                <Text style={dataValueStyle(70)}>{formatPercent(Number(stats?.urgentTotal) || 0)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={styles.text}>ระบุปัญหาที่พบ</Text>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.urgentDetail)}</Text>
            </View>
            {[1, 2, 3].map((i) => (
                <View key={i} style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                    <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
                </View>
            ))}

            {/* Point 16 */}
            <View style={[rowStyle, { marginTop: 12 }]}>
                <Text style={styles.text}>16. หน่วยงาน/สหวิชาชีพ/องค์กร ที่ร่วมเยี่ยมบ้าน</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.agenciesJoined)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>

            {/* Point 17 */}
            <View style={[rowStyle, { marginTop: 12 }]}>
                <Text style={styles.text}>17. การนำข้อมูลเยี่ยมบ้านนักเรียนไปใช้ประโยชน์อย่างไร</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.dataUsage)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>

            {/* Point 18 */}
            <View style={[rowStyle, { marginTop: 12 }]}>
                <Text style={styles.text}>18. ข้อห่วงใยของผู้ปกครองที่มีต่อนักเรียน</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.parentConcernsSummary)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>

            {/* Point 19 */}
            <View style={[rowStyle, { marginTop: 12 }]}>
                <Text style={styles.text}>19. ปัญหา/อุปสรรค/ข้อเสนอแนะ</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.obstaclesSummary)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>

            {/* Point 20 */}
            <View style={[rowStyle, { marginTop: 12 }]}>
                <Text style={styles.text}>20. ความคิดเห็นข้อเสนอแนะ</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 20 }]}>
                <Text style={[styles.text, dottedStyle, { flex: 1, minHeight: 15 }]}>{s(stats?.suggestionsSummary)}</Text>
            </View>
            <View style={[rowStyle, { marginLeft: 0, marginTop: 4 }]}>
                <View style={[dottedStyle, { flex: 1, minHeight: 15 }]} />
            </View>

            {/* Signature Section */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 40 }}>
                {/* Signature Box 1 */}
                <View style={[styles.signatureBox, { width: '45%', alignItems: 'center' }]}>
                    <Text>ลงชื่อ ..........................................................................</Text>
                    <Text style={{ marginTop: 4 }}>( {teachers && teachers[0]
                        ? `${formatFullTitle(teachers[0].title)}${teachers[0].firstName} ${teachers[0].lastName}`
                        : (teacherName && (!teachers || teachers.length === 0) ? teacherName : '..........................................................................')} )</Text>
                    <Text style={{ marginTop: 5 }}>ครูที่ปรึกษา</Text>
                    <Text style={{ marginTop: 5 }}>{thaiDate}</Text>
                </View>

                {/* Signature Box 2 */}
                <View style={[styles.signatureBox, { width: '45%', alignItems: 'center' }]}>
                    <Text>ลงชื่อ ..........................................................................</Text>
                    <Text style={{ marginTop: 4 }}>( {teachers && teachers[1]
                        ? `${formatFullTitle(teachers[1].title)}${teachers[1].firstName} ${teachers[1].lastName}`
                        : '..........................................................................'} )</Text>
                    <Text style={{ marginTop: 5 }}>ครูที่ปรึกษา</Text>
                    <Text style={{ marginTop: 5 }}>{thaiDate}</Text>
                </View>
            </View>
        </Page>
    );
};

export default SummaryPage2;
