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

// Aliases for backward compatibility or easier usage
export const CLASSES = CLASS_MAPPING;
