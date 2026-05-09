import { View, Text, Image, Page } from '@react-pdf/renderer';
import { styles } from './HomeVisitPdfStyles';
import Checkbox, { CheckMarkSymbol } from './Checkbox';
import { HomeVisitPdfProps } from './types';
import { formatFullTitle } from './utils';


const Page1: React.FC<HomeVisitPdfProps> = ({ student, visit }) => {
    const renderDottedLineWithText = (text: string | number | undefined, width: number | string) => (
        <View style={[styles.centeredDottedLine, { width }]}>
            <Text style={styles.centeredTextOnLine}>{text || ''}</Text>
        </View>
    );

    const getThaiMonth = (monthStr: string | undefined) => {
        if (!monthStr) return '';
        const months = [
            'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
            'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
        ];
        const monthIdx = parseInt(monthStr) - 1;
        return months[monthIdx] || '';
    };

    const visitDay = visit.visitDate ? visit.visitDate.split('-')[2] : '';
    const visitMonth = visit.visitDate ? getThaiMonth(visit.visitDate.split('-')[1]) : '';
    const visitYear = visit.visitDate ? parseInt(visit.visitDate.split('-')[0]) + 543 : '';

    return (
        <Page style={styles.page}>
            <Text style={styles.pageNumber}>-1-</Text>

            <View style={{ position: 'relative', marginBottom: 12 }}>
                <Text style={styles.header}>แบบบันทึกการเยี่ยมบ้านนักเรียน</Text>
                <Text style={styles.subHeader}>ปีการศึกษา {visit.academicYear}</Text>

                <View style={styles.studentPhoto}>
                    {student.profileImageUrl ? (
                        <Image src={student.profileImageUrl} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                        <View style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                            <Text style={{ fontSize: 10 }}>รูปนักเรียน</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* ข้อมูลทั่วไป */}
            <View style={[styles.rowNoWrap, { marginTop: 6 }]}>
                <Text style={styles.label}>ชื่อ - สกุล </Text>
                <View style={{ flex: 1 }}>{renderDottedLineWithText(`${formatFullTitle(student.title)}${student.firstName || ''} ${student.lastName || ''}`, '100%')}</View>
                <Text style={styles.label}> ชื่อเล่น </Text>
                <View style={{ width: 80 }}>{renderDottedLineWithText(visit.studentNickname || ' ', '100%')}</View>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 2 }]}>
                <Text style={styles.label}>ชั้น </Text>
                <View style={{ width: 40 }}>{renderDottedLineWithText(`${student.classLevel || ''}/${student.room || ''}`, '100%')}</View>
                <Text style={styles.label}> เลขที่ </Text>
                <View style={{ width: 30 }}>{renderDottedLineWithText(student.studentNumber || student.studentId || ' ', '100%')}</View>
                <Text style={styles.label}> โทรศัพท์ </Text>
                <View style={{ width: 120 }}>{renderDottedLineWithText(visit.studentPhone || ' ', '100%')}</View>
                <Text style={styles.label}> ID Line </Text>
                <View style={{ width: 100 }}>{renderDottedLineWithText(visit.studentLineId || ' ', '100%')}</View>
                <Text style={styles.label}> Facebook </Text>
                <View style={{ flex: 1 }}>{renderDottedLineWithText(visit.studentFacebook || ' ', '100%')}</View>
            </View>

            {/* สถานการณ์การเยี่ยม */}
            <View style={[styles.rowNoWrap, { marginTop: 6 }]}>
                <Text style={styles.label}>สถานการณ์เยี่ยม:</Text>
                <Checkbox checked={visit.visitStatus === 'เยี่ยมแล้ว'} label="เยี่ยมแล้ว" />
                <Text style={styles.text}>ครั้งที่</Text>
                <View style={{ width: 30 }}>{renderDottedLineWithText(visit.visitNo, '100%')}</View>
                <Text style={styles.text}> ภาคเรียนที่ </Text>
                <View style={{ width: 40 }}>{renderDottedLineWithText(visit.semester, '100%')}</View>
                <Text style={styles.text}> / {visit.academicYear} </Text>
                <Checkbox checked={visit.visitStatus !== 'เยี่ยมแล้ว'} label="ยังไม่ได้เยี่ยม" />
                <View style={{ flex: 1 }}>{renderDottedLineWithText(visit.visitStatus !== 'เยี่ยมแล้ว' ? ' ' : '', '100%')}</View>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 2 }]}>
                <Text style={styles.label}>ข้อมูลจากการสังเกตและสอบถาม : ให้ทำเครื่องหมาย </Text>
                <View style={[styles.checkbox, { marginLeft: 2, marginRight: 5 }]}>
                    <CheckMarkSymbol />
                </View>
                <Text style={styles.label}> ในช่องสี่เหลี่ยม</Text>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 2 }]}>
                <Text style={styles.text}>การเยี่ยมบ้านครั้งนี้สนทนากับ ชื่อ-สกุล </Text>
                <View style={{ flex: 1 }}>{renderDottedLineWithText(visit.visitorNameBySide, '100%')}</View>
                <Text style={styles.text}> เกี่ยวข้องกับนักเรียนเป็น </Text>
                <View style={{ width: 100 }}>{renderDottedLineWithText(visit.relationshipWithStudent, '100%')}</View>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 1 }]}>
                <Text style={styles.text}>เยี่ยมบ้าน วันที่ </Text>
                <View style={{ width: 40 }}>{renderDottedLineWithText(visitDay, '100%')}</View>
                <Text style={styles.text}> เดือน </Text>
                <View style={{ width: 100 }}>{renderDottedLineWithText(visitMonth, '100%')}</View>
                <Text style={styles.text}> พ.ศ. </Text>
                <View style={{ width: 60 }}>{renderDottedLineWithText(visitYear, '100%')}</View>
                <Text style={styles.text}> เวลา </Text>
                <View style={{ width: 60 }}>{renderDottedLineWithText(visit.startTime, '100%')}</View>
                <Text style={styles.text}> น. ถึง </Text>
                <View style={{ width: 60 }}>{renderDottedLineWithText(visit.endTime, '100%')}</View>
                <Text style={styles.text}> น.</Text>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 2 }]}>
                <Text style={styles.label}>รูปแบบการเยี่ยมบ้าน : </Text>
                <Checkbox checked={visit.visitType === 'เดินทางไปที่พักอาศัยของนักเรียน'} label="เดินทางไปที่พักอาศัยของนักเรียน" />
                <Checkbox checked={visit.visitStatus === 'Online' || visit.visitType === 'Online' || visit.visitType === 'เยี่ยมผ่านออนไลน์/โทรศัพท์'} label="Online" />
            </View>

            {/* ข้อมูลที่พัก */}
            <Text style={[styles.label, { marginTop: 6 }]}>บ้านที่พักอาศัย</Text>

            <View style={[styles.rowNoWrap, { marginTop: 1 }]}>
                <Text style={styles.label}>1. บ้าน/ที่พักอาศัย</Text>
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 1 }]}>
                <Text style={styles.text}>นักเรียนอาศัยอยู่กับ </Text>
                <Checkbox checked={false} label="ไม่มีผู้ดูแล" />
                <Checkbox checked={visit.relationshipWithStudent === 'บิดามารดา' || visit.relationshipWithStudent === 'บิดา' || visit.relationshipWithStudent === 'มารดา'} label="บิดา/มารดา" />
                <Checkbox checked={!['บิดามารดา', 'บิดา', 'มารดา', 'ไม่มีผู้ดูแล'].includes(visit.relationshipWithStudent)} label="ผู้อื่น" />
                <View style={{ flex: 1 }}>{renderDottedLineWithText(!['บิดามารดา', 'บิดา', 'มารดา', 'ไม่มีผู้ดูแล'].includes(visit.relationshipWithStudent) ? visit.relationshipWithStudent : ' ', '100%')}</View>
            </View>

            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 2 }]}>
                <Text style={styles.text}>ลักษณะบ้านพัก </Text>
                <Checkbox checked={visit.housingType === 'บ้านของตนเอง' || visit.housingType === 'บ้านตนเอง'} label="บ้านของตนเอง" />
                <Checkbox checked={visit.housingType === 'บ้านเช่า/หอพัก'} label="บ้านเช่า/หอพัก" />
                <Checkbox checked={visit.housingType === 'อาศัยอยู่กับผู้อื่น'} label="อาศัยอยู่กับผู้อื่น" />
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 87 }]}>
                <Checkbox checked={visit.housingType === 'บ้านพักของหน่วยงาน'} label="บ้านพักของหน่วยงาน" />
                <Checkbox checked={visit.housingType === 'บ้านญาติ'} label="บ้านญาติ" />
                <Checkbox checked={visit.housingType === 'อื่นๆ'} label="อื่นๆ" />
                <View style={{ width: 100 }}>{renderDottedLineWithText(visit.housingType === 'อื่นๆ' ? visit.housingTypeOther : ' ', '100%')}</View>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 4 }]}>
                <Text style={styles.label}>2. ระยะทางระหว่างบ้านไปโรงเรียนไป/กลับ</Text>
                <View style={{ width: 80 }}>{renderDottedLineWithText(visit.travelDistance, '100%')}</View>
                <Text style={styles.text}>กิโลเมตร ใช้เวลาเดินทาง</Text>
                <View style={{ width: 30 }}>{renderDottedLineWithText(visit.travelTimeHours, '100%')}</View>
                <Text style={styles.text}>ชม.</Text>
                <View style={{ width: 30 }}>{renderDottedLineWithText(visit.travelTimeMinutes, '100%')}</View>
                <Text style={styles.text}>นาที</Text>
            </View>

            <View style={[styles.rowNoWrap, { marginTop: 4 }]}>
                <Text style={styles.label}>3. การเดินทางของนักเรียน </Text>
                <Checkbox checked={visit.travelMethod === 'ผู้ปกครองมาส่ง'} label="ผู้ปกครองมาส่ง" />
                <Checkbox checked={visit.travelMethod === 'อื่นๆ'} label="อื่นๆ" />
                <View style={{ flex: 1 }}>{renderDottedLineWithText(visit.travelMethod === 'อื่นๆ' ? visit.travelMethodDetail : ' ', '100%')}</View>
            </View>

            <View style={[styles.rowNoWrap, { marginLeft: 110, marginTop: 1 }]}>
                <Checkbox checked={visit.travelMethod === 'รถโรงเรียน'} label="รถโรงเรียน" />
                <Checkbox checked={visit.travelMethod === 'รถโดยสารประจำทาง'} label="รถโดยสารประจำทาง" />
                <Checkbox checked={visit.travelMethod === 'รถยนต์ส่วนตัว' || visit.travelMethod === 'รถยนต์'} label="รถยนต์ส่วนตัว" />
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 110 }]}>
                <Checkbox checked={visit.travelMethod === 'รถจักรยานยนต์'} label="รถจักรยานยนต์" />
                <Checkbox checked={visit.travelMethod === 'จักรยานส่วนตัว' || visit.travelMethod === 'รถจักรยาน'} label="จักรยานส่วนตัว" />
                <Checkbox checked={visit.travelMethod === 'เดิน'} label="เดิน" />
            </View>

            {/* ส่วนที่ 4 */}
            <View style={[styles.rowNoWrap, { marginTop: 6 }]}>
                <Text style={styles.label}>4. สภาพแวดล้อมที่อยู่อาศัย</Text>
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 1 }]}>
                <Text style={styles.text}>4.1 สภาพตัวบ้าน </Text>
                <Checkbox checked={visit.housingCondition === 'ดี' || visit.housingCondition === 'ดี มั่นคง'} label="ดี" />
                <Checkbox checked={visit.housingCondition === 'พอใช้'} label="พอใช้" />
                <Checkbox checked={visit.housingCondition === 'เก่าทรุดโทรม'} label="เก่าทรุดโทรม" />
                <Checkbox checked={visit.housingCondition === 'คับแคบ'} label="พื้นที่คับแคบ" />
                <Checkbox checked={visit.housingCondition === 'ไม่เป็นสัดส่วน'} label="ไม่มีความเป็นสัดส่วน" />
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 2 }]}>
                <Text style={styles.text}>4.2 สะอาดมีระเบียบ </Text>
                <Checkbox checked={visit.housingCleanliness === 'ไม่ค่อยสะอาด'} label="ไม่ค่อยสะอาด" />
                <Checkbox checked={visit.housingCleanliness === 'สกปรกไม่มีระเบียบ'} label="สกปรกไม่มีระเบียบ" />
                <Checkbox checked={visit.housingCleanliness === 'อื่นๆ'} label="อื่นๆ" />
                <View style={{ width: 100 }}>{renderDottedLineWithText(visit.housingCleanliness === 'อื่นๆ' ? visit.housingCleanlinessOther : ' ', '100%')}</View>
            </View>

            {/* ส่วน 4.3 จัดแนวใหม่ให้เป๊ะตามภาพล่าสุด */}
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 2 }]}>
                <Text style={[styles.text, { width: 120 }]}>4.3 สาธารณูปโภค </Text>
                <Text style={[styles.text, { width: 150 }]}>ไฟฟ้า </Text>
                <Checkbox checked={visit.utilitiesElectricity === 'มี'} label="มี" />
                <Checkbox checked={visit.utilitiesElectricity === 'ไม่มี'} label="ไม่มี" />
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 1 }]}>
                <View style={{ width: 120 }} />
                <Text style={[styles.text, { width: 150 }]}>น้ำเพื่อให้อุปโภค/บริโภค </Text>
                <Checkbox checked={visit.utilitiesWater === 'มี'} label="มี" />
                <Checkbox checked={visit.utilitiesWater === 'ไม่มี'} label="ไม่มี" />
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 1 }]}>
                <View style={{ width: 120 }} />
                <Text style={[styles.text, { width: 150 }]}>ห้องสุขา </Text>
                <Checkbox checked={visit.utilitiesToilet === 'มี'} label="มี" />
                <Checkbox checked={visit.utilitiesToilet === 'ไม่มี'} label="ไม่มี" />
            </View>

            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 4 }]}>
                <Text style={styles.text}>4.4 โปรดระบุสภาพแวดล้อมรอบที่อยู่อาศัย เช่น ใกล้แหล่งมั่วสุม ใกล้โรงงาน ใกล้สถานบันเทิง ชุมชนแออัด เป็นต้น</Text>
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 1 }]}>
                <View style={{ flex: 1 }}>{renderDottedLineWithText(visit.environmentNear || ' ', '100%')}</View>
            </View>

            {/* ข้อมูลครอบครัว */}
            <Text style={[styles.label, { marginTop: 10 }]}>ข้อมูลครอบครัว</Text>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 2 }]}>
                <Text style={styles.text}>1. มีสมาชิกในครอบครัวรวมนักเรียน </Text>
                <Text style={[styles.text, { marginLeft: 15 }]}>ชาย </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.familyMaleCount, '100%')}</View>
                <Text style={styles.text}> คน  หญิง </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.familyFemaleCount, '100%')}</View>
                <Text style={styles.text}> คน  รวม </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.familyTotalCount, '100%')}</View>
                <Text style={styles.text}> คน </Text>
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 3 }]}>
                <Text style={styles.text}>2. มีพี่น้องที่เกิดจากบิดามารดาเดียวกัน </Text>
                <Text style={styles.text}> ชาย </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.siblingSameParentsMale, '100%')}</View>
                <Text style={styles.text}> คน  หญิง </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.siblingSameParentsFemale, '100%')}</View>
                <Text style={styles.text}> คน  รวม </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(parseInt(visit.siblingSameParentsMale || '0') + parseInt(visit.siblingSameParentsFemale || '0'), '100%')}</View>
                <Text style={styles.text}> คน </Text>
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 20, marginTop: 3 }]}>
                <Text style={styles.text}>3. มีพี่น้องที่เกิดจากต่างบิดามารดา </Text>
                <Text style={styles.text}>    ชาย </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.siblingDifferentParentsMale, '100%')}</View>
                <Text style={styles.text}> คน  หญิง </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(visit.siblingDifferentParentsFemale, '100%')}</View>
                <Text style={styles.text}> คน  รวม </Text>
                <View style={{ width: 45 }}>{renderDottedLineWithText(parseInt(visit.siblingDifferentParentsMale || '0') + parseInt(visit.siblingDifferentParentsFemale || '0'), '100%')}</View>
                <Text style={styles.text}> คน </Text>
            </View>
            <View style={[styles.rowNoWrap, { marginLeft: 42, marginTop: 6 }]}>
                <Text style={styles.text}>กรณีในครอบครัวมีผู้ที่ต้องการการช่วยเหลือเป็นกรณีพิเศษ </Text>
                <View style={{ flex: 1 }}>{renderDottedLineWithText(visit.specialNeedDetail, '100%')}</View>
                <Text style={styles.text}> รวม </Text>
                <View style={{ width: 40 }}>{renderDottedLineWithText(visit.specialNeedHelpCount, '100%')}</View>
                <Text style={styles.text}> คน </Text>
            </View>

        </Page>
    );
};

export default Page1;
