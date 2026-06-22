/**
 * Timezone-agnostic date string utilities
 * All dates are handled as strings in YYYY-MM-DD format to avoid timezone conversion issues
 */

/**
 * Format a Date object to YYYY-MM-DD string (timezone-agnostic)
 * Uses local date components to avoid timezone conversion
 */
export function formatDateToString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse a YYYY-MM-DD string to Date object (timezone-agnostic)
 * Creates date in local timezone to avoid UTC conversion
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Add days to a date string and return new date string
 * @param dateStr YYYY-MM-DD format
 * @param days Number of days to add (can be negative)
 * @returns New date string in YYYY-MM-DD format
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  const date = parseDateString(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateToString(date);
}

/**
 * Normalize a value to YYYY-MM-DD string.
 * Use when comparing dates that may come as either string (YYYY-MM-DD) or Date.
 */
export function toDateStringOnly(value: string | Date): string {
  if (value instanceof Date) {
    return formatDateToString(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  // Fallback: parse as date and format (e.g. ISO or other string)
  const d = typeof value === 'string' ? new Date(value) : value;
  return formatDateToString(d);
}

/**
 * Compare two date strings
 * @returns negative if date1 < date2, positive if date1 > date2, 0 if equal
 */
export function compareDateStrings(date1: string, date2: string): number {
  return date1.localeCompare(date2);
}

/**
 * Get English day-of-week name from JavaScript day index (0 = Sunday, 6 = Saturday).
 */
export function getDayOfTheWeekName(dayOfWeek: number): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[dayOfWeek] ?? '';
}

export function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return "";

  let d: Date;
  if (dateStr.includes("T")) {
    d = new Date(dateStr);
  } else {
    d = new Date(dateStr + "T00:00:00");
  }

  if (isNaN(d.getTime())) return dateStr;

  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}