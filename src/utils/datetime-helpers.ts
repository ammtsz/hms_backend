/**
 * Utility functions for converting between timezone-agnostic date/time pairs and timestamp strings
 */

import { getCurrentDateTimeInTimezone, getClinicTimezone } from '../common/utils/timezone.utils';

/**
 * Combine date and time strings into ISO timestamp string
 * @param dateStr YYYY-MM-DD format
 * @param timeStr HH:MM:SS format
 * @returns ISO timestamp string or null if either parameter is null/undefined
 */
export function combineDateTimeToTimestamp(
  dateStr: string | null,
  timeStr: string | null,
): string | null {
  if (!dateStr || !timeStr) return null;

  // Combine date and time strings and create ISO string
  // Note: This creates a local time timestamp without timezone conversion
  return `${dateStr}T${timeStr}`;
}

/**
 * Get current date as YYYY-MM-DD string in server timezone (default America/Vancouver).
 * Avoids UTC conversion bugs when the server or users are in another timezone.
 */
export function getCurrentDateString(): string {
  const tz = getClinicTimezone();
  const { date } = getCurrentDateTimeInTimezone(tz);
  return date;
}

/**
 * Get current time as HH:MM:SS string in server timezone.
 */
export function getCurrentTimeString(): string {
  const tz = getClinicTimezone();
  const { time } = getCurrentDateTimeInTimezone(tz);
  return time;
}
