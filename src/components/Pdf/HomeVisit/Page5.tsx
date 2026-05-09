import { View, Text, Image, Page } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';
import Checkbox, { CheckMarkSymbol } from './Checkbox';
import { HomeVisitPdfProps } from './types';
import { formatFullTitle } from './utils';


const Page5: React.FC<HomeVisitPdfProps> = ({ student, visit, teacherName, teachers }) => {
    return (
        <Page style={styles.page}>
            <Text style={styles.pageNumber}>-5-</Text>

            <Text style={styles.header}>ภาพถ่ายบ้านนักเรียนที่ได้รับการเยี่ยมบ้าน</Text>

            <View style={[styles.row, { justifyContent: 'center', marginTop: 10 }]}>
                <Text style={styles.text}>ชื่อ-นามสกุลนักเรียน </Text>
                <Text style={styles.text}>{formatFullTitle(student.title)}{student.firstName || ''} {student.lastName || ''}</Text>
                <View style={[styles.dottedLine, { minWidth: 200 }]} />
            </View>

            <View style={[styles.row, { marginTop: 10 }]}>
                <Text style={styles.label}>กรุณาระบุภาพถ่ายที่แนบมาคือ </Text>
                <Checkbox checked={['บ้านของตนเอง', 'บ้านเช่า/หอพัก', 'บ้านตนเอง'].includes(visit.housingType)} label="บ้านที่อยู่อาศัยกับพ่อแม่" />
                <View style={[styles.checkbox, { justifyContent: 'center', alignItems: 'center', marginLeft: 5 }]}>{['บ้านของตนเอง', 'บ้านตนเอง'].includes(visit.housingType) ? <CheckMarkSymbol /> : null}</View>
                <Text style={styles.text}>เป็นเจ้าของ / </Text>
                <View style={[styles.checkbox, { justifyContent: 'center', alignItems: 'center' }]}>{visit.housingType === 'บ้านเช่า/หอพัก' ? <CheckMarkSymbol /> : null}</View>
                <Text style={styles.text}>เช่า</Text>
            </View>
            <View style={[styles.row, { marginLeft: 110 }]}>
                <Checkbox checked={visit.housingType === 'บ้านญาติ'} label="บ้านของญาติ" />
            </View>
            <View style={[styles.row, { marginLeft: 110 }]}>
                <Checkbox checked={['บ้านพักหน่วยงาน', 'อาศัยอยู่กับผู้อื่น', 'อื่นๆ'].includes(visit.housingType)} label="บ้านหรือที่พักประเภท " />
                <Text style={styles.text}>{['บ้านพักหน่วยงาน', 'อาศัยอยู่กับผู้อื่น', 'อื่นๆ'].includes(visit.housingType) ? (visit.housingType === 'อื่นๆ' ? visit.housingTypeOther : visit.housingType) : ''}</Text>
                <View style={[styles.dottedLine, { flex: 1 }]} />
            </View>
            <View style={[styles.row, { marginLeft: 110 }]}>
                <Checkbox checked={visit.photos?.schoolSign ? true : false} label="ภาพนักเรียนและป้ายโรงเรียนเนื่องจากถ่ายภาพบ้านไม่ได้ เพราะบ้านอยู่ต่างอำเภอ/ " />
            </View>
            <View style={[styles.row, { marginLeft: 130 }]}>
                <Text style={styles.text}>ต่างจังหวัด/ต่างประเทศ หรือไม่ได้รับอนุญาตให้ถ่ายภาพ</Text>
            </View>

            <View style={{ marginTop: 20, alignItems: 'center' }}>
                <Text style={styles.label}>รูปที่ 1 ภาพถ่ายสภาพบ้านนักเรียน</Text>
                <View style={{ width: '80%', height: 220, borderWidth: 1, borderColor: '#000', marginTop: 5, justifyContent: 'center', alignItems: 'center' }}>
                    {visit.photos?.exterior ? (
                        <Image src={visit.photos.exterior} style={{ width: '95%', height: '95%', objectFit: 'contain' }} />
                    ) : (
                        <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: '#aaa' }}>ภาพถ่ายร่วมกับบ้าน</Text>
                            <Text style={{ color: '#aaa', fontSize: 10 }}>โดยให้เห็นหลังคาและฝาบ้านด้วย</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={{ marginTop: 20, alignItems: 'center' }}>
                <Text style={styles.label}>รูปที่ 2 ภาพถ่ายภายในบ้านนักเรียน</Text>
                <View style={{ width: '80%', height: 220, borderWidth: 1, borderColor: '#000', marginTop: 5, justifyContent: 'center', alignItems: 'center' }}>
                    {visit.photos?.interior || visit.photos?.schoolSign ? (
                        <Image src={visit.photos?.interior || visit.photos?.schoolSign} style={{ width: '95%', height: '95%', objectFit: 'contain' }} />
                    ) : (
                        <View style={{ alignItems: 'center' }}>
                            <Text style={{ color: '#aaa' }}>ภาพถ่ายให้เห็นภายในบ้านมุมกว้างๆ</Text>
                        </View>
                    )}
                </View>
            </View>

            <View style={styles.signatureContainer}>
                {/* Signature Box 1 */}
                <View style={styles.signatureBox}>
                    <Text>ลงชื่อ ..........................................................................</Text>
                    <Text>( {teachers && teachers[0]
                        ? `${formatFullTitle(teachers[0].title)}${teachers[0].firstName} ${teachers[0].lastName}`
                        : (teacherName && (!teachers || teachers.length === 0) ? teacherName : '..........................................................................')} )</Text>
                    <Text style={{ marginTop: 5 }}>ครูที่ปรึกษา</Text>
                </View>

                {/* Signature Box 2 */}
                <View style={styles.signatureBox}>
                    <Text>ลงชื่อ ..........................................................................</Text>
                    <Text>( {teachers && teachers[1]
                        ? `${formatFullTitle(teachers[1].title)}${teachers[1].firstName} ${teachers[1].lastName}`
                        : '..........................................................................'} )</Text>
                    <Text style={{ marginTop: 5 }}>ครูที่ปรึกษา</Text>
                </View>
            </View>

        </Page>
    );
};

export default Page5;
