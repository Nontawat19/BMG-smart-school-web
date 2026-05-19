export interface SubjectGroupLike {
    id?: string;
    code?: string;
    name?: string;
}

export const normalizeSubjectGroupValue = (value?: string) => {
    return (value || "")
        .replace(/^กลุ่มสาระการเรียนรู้\s*/u, "")
        .replace(/^กลุ่มสาระ\s*/u, "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase();
};

export const getSubjectGroupInfo = <T extends SubjectGroupLike>(
    value: string | undefined,
    subjectGroups: T[] = []
) => {
    const rawValue = (value || "").trim();
    if (!rawValue) return undefined;

    const normalizedValue = normalizeSubjectGroupValue(rawValue);
    return subjectGroups.find(group => {
        const candidates = [group.id, group.code, group.name].filter(Boolean) as string[];
        return candidates.some(candidate =>
            candidate === rawValue ||
            normalizeSubjectGroupValue(candidate) === normalizedValue
        );
    });
};

export const getSubjectGroupName = (
    value: string | undefined,
    subjectGroups: SubjectGroupLike[] = []
) => {
    return getSubjectGroupInfo(value, subjectGroups)?.name || value || "";
};

export const isSubjectGroupMatch = (
    courseGroup: string | undefined,
    selectedGroup: string | undefined,
    subjectGroups: SubjectGroupLike[] = [],
    allValues: string[] = ["all", "ทั้งหมด", "กลุ่มสาระทั้งหมด"]
) => {
    if (!selectedGroup || allValues.includes(selectedGroup)) return true;
    if (!courseGroup) return false;

    const courseInfo = getSubjectGroupInfo(courseGroup, subjectGroups);
    const selectedInfo = getSubjectGroupInfo(selectedGroup, subjectGroups);
    const courseValues = [
        courseGroup,
        courseInfo?.id,
        courseInfo?.code,
        courseInfo?.name,
    ].filter(Boolean) as string[];
    const selectedValues = [
        selectedGroup,
        selectedInfo?.id,
        selectedInfo?.code,
        selectedInfo?.name,
    ].filter(Boolean) as string[];

    return courseValues.some(courseValue =>
        selectedValues.some(selectedValue =>
            courseValue === selectedValue ||
            normalizeSubjectGroupValue(courseValue) === normalizeSubjectGroupValue(selectedValue)
        )
    );
};

export const isPassFailActivityCourse = (
    course: {
        code?: string;
        title?: string;
        type?: string;
        subjectGroup?: string;
        learningArea?: string;
    },
    subjectGroups: SubjectGroupLike[] = []
) => {
    const code = String(course.code || "").trim();
    const title = String(course.title || "").trim();
    const type = String(course.type || "").trim();
    const groupValue = String(course.subjectGroup || course.learningArea || "").trim();
    const resolvedGroup = getSubjectGroupName(groupValue, subjectGroups);

    const normalizedText = normalizeSubjectGroupValue(`${title} ${type} ${groupValue} ${resolvedGroup}`);
    const normalizedGroup = normalizeSubjectGroupValue(resolvedGroup || groupValue);
    const normalizedCode = code.toLowerCase();

    return (
        /^i\d/i.test(code) ||
        /^ก\d/u.test(code) ||
        normalizedCode === "i" ||
        code === "ก" ||
        ["i", "ก"].includes(groupValue.toLowerCase()) ||
        ["i", "ก"].includes(String(getSubjectGroupInfo(groupValue, subjectGroups)?.code || "").toLowerCase()) ||
        normalizedGroup.includes("ค้นคว้า") ||
        normalizedGroup.includes("กิจกรรมพัฒนาผู้เรียน") ||
        normalizedText.includes("กิจกรรม") ||
        normalizedText.includes("ชุมนุม") ||
        normalizedText.includes("แนะแนว")
    );
};
