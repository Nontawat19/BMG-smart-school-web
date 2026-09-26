/** "ทุกวัน" ของคาบพิเศษหมายถึงเฉพาะจันทร์–ศุกร์ (ไม่รวมเสาร์–อาทิตย์) */
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri'];

export const specialPeriodMatchesDay = (periodDay: string | null | undefined, dayKey: string): boolean => {
  if (!periodDay || periodDay === 'all') return WEEKDAY_KEYS.includes(dayKey);
  return periodDay === dayKey;
};
