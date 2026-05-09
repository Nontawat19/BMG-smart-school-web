import { View, Text, Page } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';
import Checkbox, { CheckMarkSymbol } from './Checkbox';
import { HomeVisitPdfProps } from './types';


const Page2: React.FC<HomeVisitPdfProps> = ({ visit }) => {
    const rels = visit.relationships || {};

    return (
        <Page style={styles.page}>
            <Text style={styles.pageNumber}>-2-</Text>

            <Text style={styles.label}>ความสัมพันธ์ของสมาชิกในครอบครัว</Text>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={!!visit.bothParentsDeceased} label="พบว่านักเรียนที่บิดาและมารดาเสียชีวิต" />
                <Checkbox checked={!!visit.oneParentDeceased} label="พบว่านักเรียนที่บิดาหรือมารดาเสียชีวิต" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={!!visit.parentsSeparated} label="พบว่านักเรียนที่บิดาและมารดาแยกทางกัน" />
            </View>

            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.familyAtmosphere === 'รักใคร่กันดี'} label="รักใคร่กันดี" />
                <Checkbox checked={visit.familyAtmosphere === 'ขัดแย้งทะเลาะกันบางครั้ง' || visit.familyAtmosphere === 'ขัดแย้งบ้างบางครั้ง'} label="ขัดแย้งทะเลาะกันบางครั้ง" />
                <Checkbox checked={visit.familyAtmosphere === 'ขัดแย้งทะเลาะกันบ่อยครั้ง'} label="ขัดแย้งทะเลาะกันบ่อยครั้ง" />
                <Checkbox checked={visit.familyAtmosphere === 'ห่างเหิน'} label="ห่างเหิน" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.familyAtmosphere === 'ขัดแย้งและทำร้ายร่างกายบางครั้ง'} label="ขัดแย้งและทำร้ายร่างกายบางครั้ง" />
                <Checkbox checked={visit.familyAtmosphere === 'ขัดแย้งและทำร้ายร่างกายบ่อยครั้ง'} label="ขัดแย้งและทำร้ายร่างกายบ่อยครั้ง" />
                <Checkbox checked={visit.familyAtmosphere === 'อื่นๆ'} label="อื่นๆ" />
                <View style={styles.dottedLine} />
            </View>

            <Text style={[styles.text, { marginLeft: 15, marginTop: 5 }]}>4.5 ความสัมพันธ์ระหว่างนักเรียนกับสมาชิกในครอบครัว</Text>

            <View style={[styles.table, { marginLeft: 15, width: '90%' }]}>
                <View style={styles.tableRow}>
                    <View style={[styles.tableHeaderCell, { width: '25%' }]}><Text>สมาชิก</Text></View>
                    <View style={[styles.tableHeaderCell, { width: '18%' }]}><Text>สนิทสนม</Text></View>
                    <View style={[styles.tableHeaderCell, { width: '18%' }]}><Text>เฉยๆ</Text></View>
                    <View style={[styles.tableHeaderCell, { width: '18%' }]}><Text>ห่างเหิน</Text></View>
                    <View style={[styles.tableHeaderCell, { width: '18%', borderRightWidth: 0 }]}><Text>ขัดแย้ง</Text></View>
                </View>
                {[
                    { id: 'father', label: 'บิดา' },
                    { id: 'mother', label: 'มารดา' },
                    { id: 'brother', label: 'พี่/น้องชาย' },
                    { id: 'sister', label: 'พี่/น้องสาว' },
                    { id: 'grandparents', label: 'ปู่/ย่า/ตา/ยาย' },
                    { id: 'relatives', label: 'ญาติ' },
                    { id: 'others', label: 'อื่นๆ' },
                ].map((m) => (
                    <View key={m.id} style={styles.tableRow}>
                        <View style={[styles.tableCell, { width: '25%', textAlign: 'left', paddingLeft: 5 }]}><Text>{m.label}</Text></View>
                        <View style={[styles.tableCell, { width: '18%', justifyContent: 'center', alignItems: 'center' }]}>{rels[m.id as keyof typeof rels] === 'สนิทสนม' ? <CheckMarkSymbol /> : null}</View>
                        <View style={[styles.tableCell, { width: '18%', justifyContent: 'center', alignItems: 'center' }]}>{rels[m.id as keyof typeof rels] === 'เฉยๆ' ? <CheckMarkSymbol /> : null}</View>
                        <View style={[styles.tableCell, { width: '18%', justifyContent: 'center', alignItems: 'center' }]}>{rels[m.id as keyof typeof rels] === 'ห่างเหิน' ? <CheckMarkSymbol /> : null}</View>
                        <View style={[styles.tableCell, { width: '18%', borderRightWidth: 0, justifyContent: 'center', alignItems: 'center' }]}>{rels[m.id as keyof typeof rels] === 'ขัดแย้ง' ? <CheckMarkSymbol /> : null}</View>





                    </View>
                ))}
            </View>

            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>4.6 มีเวลาอยู่ร่วมกันกี่ชั่วโมงต่อวัน</Text>
                <Text style={styles.text}> {visit.hoursTogetherPerDay} </Text>
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>4.7 ภาระงานความรับผิดชอบของนักเรียนที่มีต่อครอบครัว</Text>
                <Text style={styles.text}> {visit.studentResponsibility} </Text>
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>4.8 กิจกรรมยามว่างหรืองานอดิเรก</Text>
                <Text style={styles.text}> {visit.studentHobby} </Text>
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>4.9 กรณีผู้ปกครองไม่อยู่บ้านฝากนักเรียนอยู่บ้านกับใคร</Text>
                <Text style={styles.text}> {visit.caregiverWhenParentsAway} </Text>
                <View style={styles.dottedLine} />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>5. รายได้ </Text>
                <Text style={styles.text}>รายได้เฉลี่ยของครอบครัวต่อเดือน</Text>
                <Text style={styles.text}> {visit.familyMonthlyIncome} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>บาท นักเรียนได้รับค่าใช้จ่ายจาก</Text>
                <Text style={styles.text}> {visit.expensePayer} </Text>
                <View style={styles.dottedLine} />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>-นักเรียนทำงานหารายได้ อาชีพ</Text>
                <Text style={styles.text}> {visit.studentWorkingExtra === 'ทำงาน' ? visit.extraJobDetail : ' '} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>รายได้วันละ</Text>
                <Text style={styles.text}> {visit.studentWorkingExtra === 'ทำงาน' ? visit.extraIncome : ' '} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>บาท</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>-นักเรียนทำงานหารายได้พิเศษ อาชีพ</Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>สถานที่</Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>รายได้</Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>บาท</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.text}>นักเรียนได้เงินมาโรงเรียนวันละ</Text>
                <Text style={styles.text}> {visit.studentAllowancePerDay} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>บาท</Text>
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6. พฤติกรรมความเสี่ยง</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.label}>6.1 สุขภาพ</Text>
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.healthRisk?.includes('ร่างกายไม่แข็งแรง')} label="ร่างกายไม่แข็งแรง" />
                <Checkbox checked={visit.healthRisk?.includes('มีโรคประจำตัวหรือเจ็บป่วยบ่อย')} label="มีโรคประจำตัวหรือเจ็บป่วยบ่อย" />
                <Checkbox checked={visit.healthRisk?.includes('มีภาวะทุพโภชนาการ')} label="มีภาวะทุพโภชนาการ" />
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.healthRisk?.includes('ป่วยเป็นโรคร้ายแรง/เรื้อรัง')} label="ป่วยเป็นโรคร้ายแรง/เรื้อรัง" />
                <Checkbox checked={visit.healthRisk?.includes('สมรรถภาพร่างกายต่ำ')} label="สมรรถภาพร่างกายต่ำ" />
            </View>

            <View style={[styles.row, { marginLeft: 15 }]}>
                <Text style={styles.label}>6.2 สวัสดิการหรือความปลอดภัย</Text>
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.welfareRisk?.includes('พ่อแม่แยกทางกันหรือแต่งงานใหม่')} label="พ่อแม่แยกทางกันหรือแต่งงานใหม่" />
                <Checkbox checked={visit.welfareRisk?.includes('เล่นการพนัน')} label="เล่นการพนัน" />
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.welfareRisk?.includes('มีบุคคลในครอบครัวเจ็บป่วยด้วยโรคร้ายแรง/เรื้อรัง/ติดต่อ')} label="มีบุคคลในครอบครัวเจ็บป่วยด้วยโรคร้ายแรง..." />
                <Checkbox checked={visit.welfareRisk?.includes('บุคคลในครอบครัวติดสารเสพติด')} label="บุคคลในครอบครัวติดสารเสพติด" />
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.welfareRisk?.includes('บุคคลในครอบครัวเล่นการพนัน')} label="บุคคลในครอบครัวเล่นการพนัน" />
                <Checkbox checked={visit.welfareRisk?.includes('มีความขัดแย้ง/ทะเลาะกันในครอบครัว')} label="มีความขัดแย้ง/ทะเลาะกันในครอบครัว" />
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.welfareRisk?.includes('ความขัดแย้งและมีการใช้ความรุนแรงในครอบครัว')} label="ความขัดแย้งและมีการใช้ความรุนแรงในครอบครัว" />
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.welfareRisk?.includes('ไม่มีผู้ดูแล')} label="ไม่มีผู้ดูแล" />
                <Checkbox checked={visit.welfareRisk?.includes('ถูกทารุณ/ทำร้ายจากบุคคลในครอบครัว/เพื่อนบ้าน')} label="ถูกทารุณ/ทำร้าย..." />
            </View>
            <View style={[styles.row, { marginLeft: 30 }]}>
                <Checkbox checked={visit.welfareRisk?.includes('ถูกล่วงละเมิดทางเพศ')} label="ถูกล่วงละเมิดทางเพศ" />
            </View>
        </Page>
    );
};

export default Page2;
