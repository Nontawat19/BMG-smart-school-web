import { View, Text, Image, Page } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';
import Checkbox from './Checkbox';
import { HomeVisitPdfProps } from './types';


const Page4: React.FC<HomeVisitPdfProps> = ({ visit }) => {
    return (
        <Page style={styles.page}>
            <Text style={styles.pageNumber}>-4-</Text>

            <View style={styles.row}>
                <Text style={styles.label}>7. ข้อห่วงใยของผู้ปกครองที่มีต่อนักเรียน</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>{visit.parentConcerns || ' '}</Text>
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15, marginTop: 5 }]}>
                <View style={styles.dottedLine} />
            </View>

            <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.label}>8. สิ่งที่ผู้ปกครองต้องการให้โรงเรียนช่วยเหลือ</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.schoolAssistanceNeeded?.includes('ด้านการเรียน')} label="ด้านการเรียน" />
                <Checkbox checked={visit.schoolAssistanceNeeded?.includes('ด้านพฤติกรรม')} label="ด้านพฤติกรรม" />
                <Checkbox checked={visit.schoolAssistanceNeeded?.includes('ด้านเศรษฐกิจ')} label="ด้านเศรษฐกิจ" />
                <Checkbox checked={visit.schoolAssistanceNeeded?.includes('อื่นๆ')} label="อื่นๆ" />
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15, marginTop: 5 }]}>
                <View style={styles.dottedLine} />
            </View>

            <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.label}>9. ความช่วยเหลือที่ครอบครัวเคยได้รับจากหน่วยงานหรือต้องการได้รับการช่วยเหลือ</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>เคยได้รับความช่วยเหลือ </Text>
                {['ไม่จำเป็น', 'น้อย', 'ปานกลาง', 'มาก', 'มากที่สุด'].map(level => (
                    <Checkbox key={level} checked={visit.assistanceHistory === level} label={level} />
                ))}
            </View>
            <View style={[styles.row, { marginLeft: 15, marginTop: 5 }]}>
                <View style={styles.dottedLine} />
            </View>

            <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.label}>10. สรุปผลการเยี่ยมบ้านนักเรียนโดยรวมพบว่า</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.visitSummary === 'ปกติ'} label="ปกติ" />
                <Checkbox checked={visit.visitSummary === 'ควรส่งเสริม'} label="ควรส่งเสริมด้าน" />
                <Text style={styles.text}>{visit.visitSummary === 'ควรส่งเสริม' ? visit.visitSummaryPromoteDetail : ' '}</Text>
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.visitSummary === 'ช่วยเหลือด่วน'} label="ควรช่วยเหลืออย่างเร่งด่วน ด้าน" />
                <Text style={styles.text}>{visit.visitSummary === 'ช่วยเหลือด่วน' ? visit.visitSummaryUrgentDetail : ' '}</Text>
                <View style={styles.dottedLine} />
            </View>

            <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.label}>11. วาดภาพแผนที่การเดินทางจากโรงเรียนไปบ้านพักของนักเรียน</Text>
            </View>

            <View style={{ width: '100%', height: 350, borderWidth: 1, borderColor: '#000', marginTop: 10, justifyContent: 'center', alignItems: 'center' }}>
                {visit.photos?.sketchMap ? (
                    <Image src={visit.photos.sketchMap} style={{ width: '95%', height: '95%', objectFit: 'contain' }} />
                ) : (
                    <Text style={{ color: '#ccc', fontStyle: 'italic' }}>--- พื้นที่วาดแผนที่ ---</Text>
                )}
            </View>

        </Page>
    );
};

export default Page4;
