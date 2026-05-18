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
<<<<<<< HEAD
    return getThaiYear(new Date());
};

/**
 * Returns the Buddhist Era (BE) year for a given date.
 */
export const getThaiYear = (date: Date): number => {
    return date.getFullYear() + 543;
=======
    return new Date().getFullYear() + 543;
>>>>>>> 5f8c7e1 (feat: optimize auto-scheduler and update UI labels)
};
