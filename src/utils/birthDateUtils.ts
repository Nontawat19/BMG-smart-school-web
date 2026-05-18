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

  const text = String(value).trim();
  if (!text) return null;

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
