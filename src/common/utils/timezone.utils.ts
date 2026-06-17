/**
 * Timezone utility functions for handling timezone conversions and validation
 */

/**
 * Default timezone for the application (Brazil)
 */
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/**
 * Validates if a timezone string is a valid IANA timezone
 * @param timezone The timezone string to validate
 * @returns boolean indicating if the timezone is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    // Use Intl.DateTimeFormat to validate the timezone
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Gets the current date/time in a specific timezone
 * @param timezone The IANA timezone identifier
 * @returns Object with date and time strings in YYYY-MM-DD and HH:MM:SS format
 */
export function getCurrentDateTimeInTimezone(timezone: string) {
  const now = new Date();

  // Format date as YYYY-MM-DD
  const date = now.toLocaleDateString('en-CA', { timeZone: timezone });

  // Format time as HH:MM:SS
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: timezone,
    hour12: false,
  });

  return { date, time };
}

/**
 * Gets timezone offset in hours from UTC
 * @param timezone The IANA timezone identifier
 * @returns Offset in hours (rounded to whole number)
 */
export function getTimezoneOffset(timezone: string): number {
  const now = new Date();
  const utc = new Date(now.getTime() + now.getTimezoneOffset() * 60000);
  const target = new Date(utc.toLocaleString('en-US', { timeZone: timezone }));
  const offset = (target.getTime() - utc.getTime()) / (1000 * 60 * 60);
  return Math.round(offset);
}

/**
 * Gets the clinic timezone from CLINIC_TIMEZONE env var or default.
 */
export function getClinicTimezone(): string {
  const envTimezone = process.env.CLINIC_TIMEZONE?.trim();
  if (envTimezone) {
    if (isValidTimezone(envTimezone)) {
      return envTimezone;
    }
    console.warn(
      `Invalid CLINIC_TIMEZONE env var: ${envTimezone}, falling back to default`,
    );
  }

  return DEFAULT_TIMEZONE;
}