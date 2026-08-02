// Single source of truth for "which characteristics criterion does this SDQ domain map to" —
// shared by the table UI (badge/button visibility) and the sync actions (which columns to write),
// so the two can never drift into flagging different columns as SDQ-linked.
export const getSDQCharacteristicType = (criteriaId: string, criteriaTitle: string): 2 | 3 | 8 | undefined => {
    const cIdNum = parseInt(criteriaId);
    if (cIdNum === 2 || criteriaId === '2' || criteriaTitle.includes('ซื่อสัตย์')) return 2;
    if (cIdNum === 3 || criteriaId === '3' || criteriaTitle.includes('วินัย')) return 3;
    if (cIdNum === 8 || criteriaId === '8' || criteriaTitle.includes('จิตสาธารณะ')) return 8;
    return undefined;
};

export const isSDQCharacteristic = (criteriaId: string, criteriaTitle: string): boolean =>
    getSDQCharacteristicType(criteriaId, criteriaTitle) !== undefined;
