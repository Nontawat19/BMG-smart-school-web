type DateParts = {
  day: number;
  month: number;
  year: number;
};

const isValidDateParts = ({ day, month, year }: DateParts) => {
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return false;
  if (year < 1900 || year > 2700 || month < 1 || month > 12 || day < 1 || day > 31) return false;

  const gregorianYear = year >= 2400 ? year - 543 : year;
  const date = new Date(gregorianYear, month - 1, day);

  return date.getFullYear() === gregorianYear &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
};

const datePartsFromExcelSerial = (value: number): DateParts | null => {
  if (!Number.isFinite(value) || value < 20000 || value > 90000) return null;

  const date = new Date(Date.UTC(1899, 11, 30 + Math.floor(value)));
  return {
    day: date.getUTCDate(),
    month: date.getUTCMonth() + 1,
    year: date.getUTCFullYear(),
  };
};

const THAI_MONTHS: Record<string, number> = {
  "มกราคม": 1,
  "มค": 1,
  "ม.ค": 1,
  "กุมภาพันธ์": 2,
  "กพ": 2,
  "ก.พ": 2,
  "มีนาคม": 3,
  "มีค": 3,
  "มี.ค": 3,
  "เมษายน": 4,
  "เมย": 4,
  "เม.ย": 4,
  "พฤษภาคม": 5,
  "พค": 5,
  "พ.ค": 5,
  "มิถุนายน": 6,
  "มิย": 6,
  "มิ.ย": 6,
  "กรกฎาคม": 7,
  "กค": 7,
  "ก.ค": 7,
  "สิงหาคม": 8,
  "สค": 8,
  "ส.ค": 8,
  "กันยายน": 9,
  "กย": 9,
  "ก.ย": 9,
  "ตุลาคม": 10,
  "ตค": 10,
  "ต.ค": 10,
  "พฤศจิกายน": 11,
  "พย": 11,
  "พ.ย": 11,
  "ธันวาคม": 12,
  "ธค": 12,
  "ธ.ค": 12,
};

const toArabicDigits = (value: string) => value.replace(/[๐-๙]/g, (digit) =>
  String("๐๑๒๓๔๕๖๗๘๙".indexOf(digit))
);

const normalizeThaiMonthKey = (value: string) => value
  .trim()
  .replace(/\s+/g, "")
  .replace(/\.$/, "");

const parseThaiTextDateParts = (value: string): DateParts | null => {
  const normalizedText = toArabicDigits(value)
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const thaiTextDateMatch = normalizedText.match(/^(\d{1,2})\s+([ก-๙.]+)\s+(\d{2,4})$/);
  if (!thaiTextDateMatch) return null;

  const monthKey = normalizeThaiMonthKey(thaiTextDateMatch[2]);
  const month = THAI_MONTHS[monthKey];
  if (!month) return null;

  const rawYear = Number(thaiTextDateMatch[3]);
  const year = rawYear < 100 ? rawYear + 2500 : rawYear;
  const parts = {
    day: Number(thaiTextDateMatch[1]),
    month,
    year,
  };

  return isValidDateParts(parts) ? parts : null;
};

export const parseStudentBirthDateParts = (value: unknown): DateParts | null => {
  if (!value) return null;

  if (typeof value === "object" && value !== null && "toDate" in value && typeof value.toDate === "function") {
    const date = value.toDate();
    return {
      day: date.getDate(),
      month: date.getMonth() + 1,
      year: date.getFullYear(),
    };
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : { day: value.getDate(), month: value.getMonth() + 1, year: value.getFullYear() };
  }

  if (typeof value === "number") {
    return datePartsFromExcelSerial(value);
  }

  const text = toArabicDigits(String(value).trim());
  if (!text) return null;

  const thaiTextDateParts = parseThaiTextDateParts(text);
  if (thaiTextDateParts) return thaiTextDateParts;

  const numericValue = Number(text);
  if (Number.isFinite(numericValue) && /^\d+(\.\d+)?$/.test(text)) {
    const excelDateParts = datePartsFromExcelSerial(numericValue);
    if (excelDateParts) return excelDateParts;
  }

  const isoMatch = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (isoMatch) {
    const parts = {
      year: Number(isoMatch[1]),
      month: Number(isoMatch[2]),
      day: Number(isoMatch[3]),
    };
    return isValidDateParts(parts) ? parts : null;
  }

  const thaiDateMatch = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (thaiDateMatch) {
    const parts = {
      day: Number(thaiDateMatch[1]),
      month: Number(thaiDateMatch[2]),
      year: Number(thaiDateMatch[3]),
    };
    return isValidDateParts(parts) ? parts : null;
  }

  const parsedDate = new Date(text);
  if (Number.isNaN(parsedDate.getTime())) return null;

  return {
    day: parsedDate.getDate(),
    month: parsedDate.getMonth() + 1,
    year: parsedDate.getFullYear(),
  };
};

export const normalizeBirthDateInput = (value: unknown) => {
  const parts = parseStudentBirthDateParts(value);
  if (!parts) return value ? String(value) : "";

  const gregorianYear = parts.year >= 2400 ? parts.year - 543 : parts.year;
  return `${String(gregorianYear).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

export const toBuddhistBirthDateForSave = (value: unknown) => {
  const parts = parseStudentBirthDateParts(value);
  if (!parts) return value ? String(value) : "";

  const buddhistYear = parts.year >= 2400 ? parts.year : parts.year + 543;
  return `${String(buddhistYear).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
};

export const isValidBirthDate = (value: unknown) => {
  if (!value) return true;

  const normalizedValue = normalizeBirthDateInput(value);
  const parts = parseStudentBirthDateParts(normalizedValue);
  if (!parts) return false;

  const gregorianYear = parts.year >= 2400 ? parts.year - 543 : parts.year;
  const currentYear = new Date().getFullYear();

  return gregorianYear >= 1900 && gregorianYear <= currentYear && isValidDateParts(parts);
};

export const formatStudentBirthDateThai = (value: unknown) => {
  const parts = parseStudentBirthDateParts(value);
  if (!parts) return "-";

  const gregorianYear = parts.year >= 2400 ? parts.year - 543 : parts.year;
  const buddhistYear = parts.year >= 2400 ? parts.year : parts.year + 543;
  const date = new Date(gregorianYear, parts.month - 1, parts.day);
  const month = date.toLocaleDateString("th-TH", { month: "long" });

  return `${parts.day} ${month} ${buddhistYear}`;
};
