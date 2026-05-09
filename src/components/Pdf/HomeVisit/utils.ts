export const formatFullTitle = (title: string | undefined): string => {
    if (!title) return '';
    const map: Record<string, string> = {
        'ด.ช.': 'เด็กชาย',
        'ด.ญ.': 'เด็กหญิง',
        'น.ส.': 'นางสาว',
        'นางสาว': 'นางสาว',
        'นาย': 'นาย',
        'นาง': 'นาง',
    };
    // Clean potential dots or whitespace
    const cleanTitle = title.trim();
    return map[cleanTitle] || cleanTitle;
};
