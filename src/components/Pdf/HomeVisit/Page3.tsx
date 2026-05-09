import { View, Text, Page } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';
import Checkbox from './Checkbox';
import { HomeVisitPdfProps } from './types';


const Page3: React.FC<HomeVisitPdfProps> = ({ visit }) => {
    return (
        <Page style={styles.page}>
            <Text style={styles.pageNumber}>-3-</Text>

            <View style={styles.row}>
                <Text style={styles.label}>6.3 ระยะทางระหว่างบ้านไปโรงเรียน</Text>
                <Text style={styles.text}> {visit.travelDistance} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>กิโลเมตร ใช้เวลาเดินทาง</Text>
                <Text style={styles.text}> {visit.travelTimeHours} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>ชม.</Text>
                <Text style={styles.text}> {visit.travelTimeMinutes} </Text>
                <View style={styles.dottedLine} />
                <Text style={styles.text}>นาที</Text>
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.4 การเดินทางของนักเรียน</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.travelMethod?.includes('ผู้ปกครองมาส่ง')} label="ผู้ปกครองมาส่ง" />
                <Checkbox checked={visit.travelMethod?.includes('รถโดยสารประจำทาง')} label="รถโดยสารประจำทาง" />
                <Checkbox checked={visit.travelMethod?.includes('รถจักรยานยนต์')} label="รถจักรยานยนต์" />
                <Checkbox checked={visit.travelMethod?.includes('รถโรงเรียน')} label="รถโรงเรียน" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.travelMethod?.includes('รถยนต์')} label="รถยนต์" />
                <Checkbox checked={visit.travelMethod?.includes('จักรยาน')} label="รถจักรยาน" />
                <Checkbox checked={visit.travelMethod?.includes('เดิน')} label="เดิน" />
                <Checkbox checked={visit.travelMethod?.includes('อื่นๆ')} label="อื่นๆ" />
                <Text style={styles.text}>{visit.travelMethod?.includes('อื่นๆ') ? visit.travelMethodDetail : ' '}</Text>
                <View style={styles.dottedLine} />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.5 ภาระงานความรับผิดชอบของนักเรียนที่มีต่อครอบครัว</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.studentResponsibilities?.includes('ช่วยงานบ้าน')} label="ช่วยงานบ้าน" />
                <Checkbox checked={visit.studentResponsibilities?.includes('ช่วยดูแลคนเจ็บป่วย/พิการ')} label="ช่วยดูแลคนเจ็บป่วย/พิการ" />
                <Checkbox checked={visit.studentResponsibilities?.includes('ช่วยค้าขายเล็กๆ น้อยๆ')} label="ช่วยค้าขายเล็กๆ น้อยๆ" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.studentResponsibilities?.includes('ทำงานพิเศษแถวบ้าน')} label="ทำงานพิเศษแถวบ้าน" />
                <Checkbox checked={visit.studentResponsibilities?.includes('ช่วยงานในนาไร่')} label="ช่วยงานในนาไร่" />
                <Checkbox checked={visit.studentResponsibilities?.includes('อื่นๆ')} label="อื่นๆ" />
                <View style={styles.dottedLine} />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.6 กิจกรรมยามว่างหรืองานอดิเรก</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.studentHobbies?.includes('ดูโทรทัศน์/ฟังเพลง')} label="ดูโทรทัศน์/ฟังเพลง" />
                <Checkbox checked={visit.studentHobbies?.includes('ไปเที่ยวห้าง/ดูหนัง')} label="ไปเที่ยวห้าง/ดูหนัง" />
                <Checkbox checked={visit.studentHobbies?.includes('อ่านหนังสือ')} label="อ่านหนังสือ" />
                <Checkbox checked={visit.studentHobbies?.includes('ไปบ้านเพื่อน/เพื่อน')} label="ไปบ้านเพื่อน/เพื่อน" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.studentHobbies?.includes('แว้น/สก๊อย')} label="แว้น/สก๊อย" />
                <Checkbox checked={visit.studentHobbies?.includes('เล่นเกม คอมพิวเตอร์/มือถือ')} label="เล่นเกม คอมพิวเตอร์/มือถือ" />
                <Checkbox checked={visit.studentHobbies?.includes('ไปสวนสาธารณะ')} label="ไปสวนสาธารณะ" />
                <Checkbox checked={visit.studentHobbies?.includes('เล่นดนตรี')} label="เล่นดนตรี" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.studentHobbies?.includes('เรียนพิเศษ')} label="เรียนพิเศษ" />
                <Checkbox checked={visit.studentHobbies?.includes('อื่นๆ')} label="อื่นๆ" />
                <View style={styles.dottedLine} />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.7 พฤติกรรมการใช้สารเสพติด</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.drugRisk?.includes('คบเพื่อนในกลุ่มที่ใช้สารเสพติด')} label="คบเพื่อนในกลุ่มที่ใช้สารเสพติด" />
                <Checkbox checked={visit.drugRisk?.includes('สมาชิกในครอบครัวข้องเกี่ยวกับยาเสพติด')} label="สมาชิกในครอบครัวข้องเกี่ยวกับ..." />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.drugRisk?.includes('อยู่ในสภาพแวดล้อมที่ใช้สารเสพติด')} label="อยู่ในสภาพแวดล้อมที่ใช้สารเสพติด" />
                <Checkbox checked={visit.drugRisk?.includes('ปัจจุบันเกี่ยวข้องกับสารเสพติด')} label="ปัจจุบันเกี่ยวข้องกับสารเสพติด" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.drugRisk?.includes('เป็นผู้จำหน้าย สุรา หรือการใช้สารเสพติดอื่นๆ')} label="เป็นผู้จำหน่าย สุรา หรือการใช้สารเสพติดอื่นๆ" />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.8 พฤติกรรมการใช้ความรุนแรง</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.violenceRisk?.includes('มีการทะเลาะวิวาท')} label="มีการทะเลาะวิวาท" />
                <Checkbox checked={visit.violenceRisk?.includes('ก้าวร้าว เกเร')} label="ก้าวร้าว เกเร" />
                <Checkbox checked={visit.violenceRisk?.includes('ทะเลาะวิวาทเป็นประจำ')} label="ทะเลาะวิวาทเป็นประจำ" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.violenceRisk?.includes('ทำร้ายร่างกายผู้อื่น')} label="ทำร้ายร่างกายผู้อื่น" />
                <Checkbox checked={visit.violenceRisk?.includes('ทำร้ายร่างกายตนเอง')} label="ทำร้ายร่างกายตนเอง" />
                <Checkbox checked={visit.violenceRisk?.includes('อื่นๆ')} label="อื่นๆ" />
                <View style={styles.dottedLine} />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.9 พฤติกรรมทางเพศ</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.sexualRisk?.includes('อยู่ในกลุ่มขายบริการ')} label="อยู่ในกลุ่มขายบริการ" />
                <Checkbox checked={visit.sexualRisk?.includes('ใช้เครื่องมือสื่อสารที่เกี่ยวข้องกับด้านเพศเป็นเวลานานและบ่อยครั้ง')} label="ใช้เครื่องมือสื่อสารที่เกี่ยวข้องกับทางเพศ..." />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.sexualRisk?.includes('ขายบริการทางเพศ')} label="ขายบริการทางเพศ" />
                <Checkbox checked={visit.sexualRisk?.includes('หมกมุ่นในการใช้เครื่องมือสื่อสารที่เกี่ยวข้องทางเพศ')} label="หมกมุ่นในการใช้เครื่องมือสื่อสาร..." />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.sexualRisk?.includes('มีการมั่วสุมทางเพศ')} label="มีการมั่วสุมทางเพศ" />
                <Checkbox checked={visit.sexualRisk?.includes('ตั้งครรภ์')} label="ตั้งครรภ์" />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.10 การติดเกม</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.gameRisk?.includes('เล่นเกมเกินวันละ 1 ชั่วโมง')} label="เล่นเกมเกินวันละ 1 ชั่วโมง" />
                <Checkbox checked={visit.gameRisk?.includes('ขาดจินตนาการและความคิดสร้างสรรค์')} label="ขาดจินตนาการและความคิดสร้างสรรค์" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.gameRisk?.includes('เก็บตัว แยกตัวจากกลุ่มเพื่อน')} label="เก็บตัว แยกตัวจากกลุ่มเพื่อน" />
                <Checkbox checked={visit.gameRisk?.includes('ใช้จ่ายเงินผิดปกติ')} label="ใช้จ่ายเงินผิดปกติ" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.gameRisk?.includes('อยู่ในกลุ่มเพื่อนติดเกม')} label="อยู่ในกลุ่มเพื่อนติดเกม" />
                <Checkbox checked={visit.gameRisk?.includes('ร้านเกมอยู่ใกล้บ้านหรือโรงเรียน')} label="ร้านเกมอยู่ใกล้บ้านหรือโรงเรียน" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.gameRisk?.includes('เล่นเกมเกินวันละ 2 ชั่วโมง')} label="เล่นเกมเกินวันละ 2 ชั่วโมง" />
                <Checkbox checked={visit.gameRisk?.includes('หมกมุ่น จริงจังในการเล่นเกม')} label="หมกมุ่น จริงจังในการเล่นเกม" />
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.gameRisk?.includes('ใช้เงินสิ้นเปลือง โกหก ลักขโมยเพื่อเล่นเกม')} label="ใช้เงินสิ้นเปลือง โกหก ลักขโมยเพื่อเล่นเกม" />
                <Checkbox checked={visit.gameRisk?.includes('อื่นๆ')} label="อื่นๆ" />
                <View style={styles.dottedLine} />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.11 การเข้าถึงสื่อคอมพิวเตอร์และอินเทอร์เน็ตได้จากที่อยู่อาศัย</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.computerAccess === 'สามารถเข้าถึงอินเทอร์เน็ตได้จากที่อยู่อาศัย'} label="สามารถเข้าถึงอินเทอร์เน็ตได้จากที่อยู่อาศัย" />
                <Checkbox checked={visit.computerAccess === 'ไม่สามารถเข้าถึงอินเทอร์เน็ตได้จากที่อยู่อาศัย'} label="ไม่สามารถเข้าถึงอินเทอร์เน็ตได้จากที่อยู่อาศัย" />
            </View>

            <View style={styles.row}>
                <Text style={styles.label}>6.12 การใช้เครื่องมือสื่อสารอิเล็กทรอนิกส์</Text>
            </View>
            <View style={[styles.row, { marginLeft: 15 }]}>
                <Checkbox checked={visit.electronicUsage === 'ใช้โซเชียลมีเดีย/เกม (ไม่เกินวันละ 3 ชั่วโมง)'} label="ใช้โซเชียลมีเดีย/เกม ไม่เกินวันละ 3 ชั่วโมง" />
                <Checkbox checked={visit.electronicUsage === 'ใช้โซเชียลมีเดีย/เกม (วันละ 3 ชั่วโมงขึ้นไป)'} label="ใช้โซเชียลมีเดีย/เกม วันละ 3 ชั่วโมงขึ้นไป" />
            </View>

        </Page>
    );
};

export default Page3;
