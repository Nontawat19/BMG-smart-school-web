/**
 * Returns today's date in YYYY-MM-DD format (local time).
 * Uses 'en-CA' locale which outputs YYYY-MM-DD reliably.
 */
export const getTodayString = (): string => {
    const now = new Date();
    return now.toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" }); // Ensure consistent timezone
};

/**
 * Returns the current year in Buddhist Era (BE).
 */
export const getCurrentThaiYear = (): number => {
    return new Date().getFullYear() + 543;
};
