export const CLASS_MAPPING: Record<string, string> = {
    k1: "อ.1",
    k2: "อ.2",
    k3: "อ.3",
    p1: "ป.1",
    p2: "ป.2",
    p3: "ป.3",
    p4: "ป.4",
    p5: "ป.5",
    p6: "ป.6",
    m1: "ม.1",
    m2: "ม.2",
    m3: "ม.3",
    m4: "ม.4",
    m5: "ม.5",
    m6: "ม.6",
};

export const CLASS_LEVEL_ORDER = Object.values(CLASS_MAPPING);

export const CLASS_FULL_NAMES: Record<string, string> = {
    k1: "อนุบาล 1",
    k2: "อนุบาล 2",
    k3: "อนุบาล 3",
    p1: "ประถมศึกษาปีที่ 1",
    p2: "ประถมศึกษาปีที่ 2",
    p3: "ประถมศึกษาปีที่ 3",
    p4: "ประถมศึกษาปีที่ 4",
    p5: "ประถมศึกษาปีที่ 5",
    p6: "ประถมศึกษาปีที่ 6",
    m1: "มัธยมศึกษาปีที่ 1",
    m2: "มัธยมศึกษาปีที่ 2",
    m3: "มัธยมศึกษาปีที่ 3",
    m4: "มัธยมศึกษาปีที่ 4",
    m5: "มัธยมศึกษาปีที่ 5",
    m6: "มัธยมศึกษาปีที่ 6",
};

export interface EducationLevelGroup {
    key: string;
    label: string;
    shortLabel: string;
    levels: string[];
}

export const EDUCATION_LEVEL_GROUPS: EducationLevelGroup[] = [
    { key: 'kindergarten', label: 'อนุบาล (อ.1-อ.3)', shortLabel: 'อนุบาล', levels: ['อ.1', 'อ.2', 'อ.3'] },
    { key: 'primary_lower', label: 'ประถมศึกษาตอนต้น (ป.1-ป.3)', shortLabel: 'ประถมต้น', levels: ['ป.1', 'ป.2', 'ป.3'] },
    { key: 'primary_upper', label: 'ประถมศึกษาตอนปลาย (ป.4-ป.6)', shortLabel: 'ประถมปลาย', levels: ['ป.4', 'ป.5', 'ป.6'] },
    { key: 'secondary_lower', label: 'มัธยมศึกษาตอนต้น (ม.1-ม.3)', shortLabel: 'มัธยมต้น', levels: ['ม.1', 'ม.2', 'ม.3'] },
    { key: 'secondary_upper', label: 'มัธยมศึกษาตอนปลาย (ม.4-ม.6)', shortLabel: 'มัธยมปลาย', levels: ['ม.4', 'ม.5', 'ม.6'] },
];

export const getEducationLevelGroup = (classLevel?: string): EducationLevelGroup | undefined => {
    const normalized = String(classLevel || '').trim();
    if (!normalized) return undefined;
    return EDUCATION_LEVEL_GROUPS.find(g => g.levels.includes(normalized));
};

export const getClassLevelRank = (classLevel?: string): number => {
    const normalized = String(classLevel || '').trim();
    if (!normalized) return -1;

    const directIndex = CLASS_LEVEL_ORDER.indexOf(normalized);
    if (directIndex >= 0) return directIndex;

    const mappedLabel = CLASS_MAPPING[normalized];
    if (mappedLabel) return CLASS_LEVEL_ORDER.indexOf(mappedLabel);

    const fullNameEntry = Object.entries(CLASS_FULL_NAMES).find(([, label]) => label === normalized);
    if (fullNameEntry) return CLASS_LEVEL_ORDER.indexOf(CLASS_MAPPING[fullNameEntry[0]]);

    return -1;
};

export const isClassLevelInRange = (
    classLevel?: string,
    fromClassLevel?: string,
    toClassLevel?: string
): boolean => {
    if (!fromClassLevel && !toClassLevel) return true;

    const rank = getClassLevelRank(classLevel);
    if (rank < 0) return false;

    const fromRank = fromClassLevel ? getClassLevelRank(fromClassLevel) : 0;
    const toRank = toClassLevel ? getClassLevelRank(toClassLevel) : CLASS_LEVEL_ORDER.length - 1;
    if (fromRank < 0 || toRank < 0) return false;

    const minRank = Math.min(fromRank, toRank);
    const maxRank = Math.max(fromRank, toRank);
    return rank >= minRank && rank <= maxRank;
};

export const formatClassLevelRange = (fromClassLevel?: string, toClassLevel?: string): string => {
    if (!fromClassLevel && !toClassLevel) return 'ทุกระดับชั้น';
    if (fromClassLevel && toClassLevel) {
        return fromClassLevel === toClassLevel ? fromClassLevel : `${fromClassLevel} - ${toClassLevel}`;
    }
    return fromClassLevel ? `ตั้งแต่ ${fromClassLevel} ขึ้นไป` : `ถึง ${toClassLevel}`;
};

export const getLevelsByRange = (levelRange: string): string[] => {
    const kindergarten = ["อ.1", "อ.2", "อ.3"];
    const primary = ["ป.1", "ป.2", "ป.3", "ป.4", "ป.5", "ป.6"];
    const junior = ["ม.1", "ม.2", "ม.3"];
    const senior = ["ม.4", "ม.5", "ม.6"];

    switch (levelRange) {
        case 'ป.1-ป.6':
            return primary;
        case 'อ.1-ป.6':
            return [...kindergarten, ...primary];
        case 'ม.1-ม.6':
            return [...junior, ...senior];
        case 'ป.1-ม.3':
            return [...primary, ...junior];
        case 'ป.1-ม.6':
            return [...primary, ...junior, ...senior];
        case 'อ.1-ม.3':
            return [...kindergarten, ...primary, ...junior];
        case 'อ.1-ม.6':
            return [...kindergarten, ...primary, ...junior, ...senior];
        default:
            return [...primary, ...junior, ...senior];
    }
};

export const getClassKeysByRange = (levelRange: string): string[] => {
    const kindergarten = ["k1", "k2", "k3"];
    const primary = ["p1", "p2", "p3", "p4", "p5", "p6"];
    const junior = ["m1", "m2", "m3"];
    const senior = ["m4", "m5", "m6"];

    switch (levelRange) {
        case 'ป.1-ป.6':
            return primary;
        case 'อ.1-ป.6':
            return [...kindergarten, ...primary];
        case 'ม.1-ม.6':
            return [...junior, ...senior];
        case 'ป.1-ม.3':
            return [...primary, ...junior];
        case 'ป.1-ม.6':
            return [...primary, ...junior, ...senior];
        case 'อ.1-ม.3':
            return [...kindergarten, ...primary, ...junior];
        case 'อ.1-ม.6':
            return [...kindergarten, ...primary, ...junior, ...senior];
        default:
            return [...primary, ...junior, ...senior];
    }
};

export const getEffectiveLevelRange = (levelRange?: string, schoolType?: string): string => {
    if (levelRange) return levelRange;

    switch (schoolType) {
        case 'ประถม':
            return 'อ.1-ป.6';
        case 'ขยายโอกาส':
            return 'อ.1-ม.3';
        case 'มัธยมศึกษา':
            return 'ม.1-ม.6';
        default:
            return '';
    }
};

export const getClassOptionsBySchoolSettings = (
    levelRange?: string,
    schoolType?: string
): [string, string][] => {
    const effectiveRange = getEffectiveLevelRange(levelRange, schoolType);
    const levels = getLevelsByRange(effectiveRange);

    return Object.entries(CLASS_MAPPING).filter(([, label]) => levels.includes(label));
};

// Aliases for backward compatibility or easier usage
export const CLASSES = CLASS_MAPPING;

// ป้องกันคำว่า "โรงเรียน" ซ้ำติดกัน (ชื่อโรงเรียนในฐานข้อมูลบางแห่งมีคำว่า "โรงเรียน" นำหน้าอยู่แล้ว
// เช่น "โรงเรียนบ้านแก้วปัดโป่ง" — ถ้าโค้ดเติม "โรงเรียน" นำหน้าซ้ำอีกที จะกลายเป็น "โรงเรียนโรงเรียนบ้านแก้วปัดโป่ง")
export const dedupeSchoolWord = (text: string) => text.replace(/(โรงเรียน)(?:\1)+/g, '$1');

// โรงเรียนขนาดใหญ่ (มักเป็นมัธยม) มีรองผู้อำนวยการประจำแต่ละกลุ่มบริหารงานโดยเฉพาะ
// ส่วนโรงเรียนขนาดเล็ก/ประถม/ขยายโอกาสมักไม่มีตำแหน่งรองผู้อำนวยการระดับกลุ่มงาน ใช้ "หัวหน้าฝ่าย" แทน
// ฟังก์ชันนี้เป็นจุดเดียวที่ใช้ตัดสินใจว่าจะแสดงชื่อ+ตำแหน่งใด ให้ทุกหน้า/PDF ที่ต้องพิมพ์ตำแหน่งนี้เรียกใช้ร่วมกัน
export type AdminGroup = 'academic' | 'budget' | 'personnel' | 'general';

export interface GroupPersonnelSource {
    deputyAcademicPrefix?: string; deputyAcademicName?: string;
    deputyBudgetPrefix?: string; deputyBudgetName?: string;
    deputyPersonnelPrefix?: string; deputyPersonnelName?: string;
    deputyGeneralPrefix?: string; deputyGeneralName?: string;
    academicHeadPrefix?: string; academicHeadName?: string;
    budgetHeadPrefix?: string; budgetHeadName?: string;
    personnelHeadPrefix?: string; personnelHeadName?: string;
    generalHeadPrefix?: string; generalHeadName?: string;
    deputyPrefix?: string; deputyName?: string;
}

const GROUP_PERSONNEL_CONFIG: Record<AdminGroup, {
    deputyPrefixKey: keyof GroupPersonnelSource; deputyNameKey: keyof GroupPersonnelSource;
    headPrefixKey: keyof GroupPersonnelSource; headNameKey: keyof GroupPersonnelSource;
    deputyLabel: string; headLabel: string;
}> = {
    academic: {
        deputyPrefixKey: 'deputyAcademicPrefix', deputyNameKey: 'deputyAcademicName',
        headPrefixKey: 'academicHeadPrefix', headNameKey: 'academicHeadName',
        deputyLabel: 'รองผู้อำนวยการกลุ่มบริหารงานวิชาการ', headLabel: 'หัวหน้าฝ่ายวิชาการ',
    },
    budget: {
        deputyPrefixKey: 'deputyBudgetPrefix', deputyNameKey: 'deputyBudgetName',
        headPrefixKey: 'budgetHeadPrefix', headNameKey: 'budgetHeadName',
        deputyLabel: 'รองผู้อำนวยการกลุ่มบริหารงานงบประมาณ', headLabel: 'หัวหน้าฝ่ายบริหารงานงบประมาณ',
    },
    personnel: {
        deputyPrefixKey: 'deputyPersonnelPrefix', deputyNameKey: 'deputyPersonnelName',
        headPrefixKey: 'personnelHeadPrefix', headNameKey: 'personnelHeadName',
        deputyLabel: 'รองผู้อำนวยการกลุ่มบริหารงานบุคคล', headLabel: 'หัวหน้าฝ่ายบริหารงานบุคคล',
    },
    general: {
        deputyPrefixKey: 'deputyGeneralPrefix', deputyNameKey: 'deputyGeneralName',
        headPrefixKey: 'generalHeadPrefix', headNameKey: 'generalHeadName',
        deputyLabel: 'รองผู้อำนวยการกลุ่มบริหารงานทั่วไป', headLabel: 'หัวหน้าฝ่ายบริหารงานทั่วไป',
    },
};

/**
 * คืนค่าชื่อ+ตำแหน่งที่ควรพิมพ์สำหรับกลุ่มบริหารงานหนึ่งๆ โดยเลือกตามลำดับ:
 * รองผู้อำนวยการกลุ่มนั้น (ถ้ามีข้อมูล) > หัวหน้าฝ่ายกลุ่มนั้น > รองผู้อำนวยการทั่วไป (ถ้า fallbackToGenericDeputy)
 */
export const getGroupPersonnel = (
    info: GroupPersonnelSource | undefined | null,
    group: AdminGroup,
    fallbackToGenericDeputy = false,
    headLabelOverride?: string,
): { label: string; name: string } => {
    const config = GROUP_PERSONNEL_CONFIG[group];
    const headLabel = headLabelOverride || config.headLabel;
    if (!info) return { label: headLabel, name: '' };

    const deputyValue = [info[config.deputyPrefixKey], info[config.deputyNameKey]].filter(Boolean).join(' ');
    if (deputyValue) return { label: config.deputyLabel, name: deputyValue };

    const headValue = [info[config.headPrefixKey], info[config.headNameKey]].filter(Boolean).join(' ');
    if (headValue) return { label: headLabel, name: headValue };

    if (fallbackToGenericDeputy) {
        const genericDeputyValue = [info.deputyPrefix, info.deputyName].filter(Boolean).join(' ');
        if (genericDeputyValue) return { label: 'รองผู้อำนวยการ', name: genericDeputyValue };
    }

    return { label: headLabel, name: '' };
};
