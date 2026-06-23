import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '../enums';

/**
 * Parses repeated `status` query params for GET /appointments/schedule.
 * Unknown values are dropped; empty after filter → undefined (all statuses).
 */
export function parseScheduleStatusQuery(
  statusQuery?: string | string[],
): AppointmentStatus[] | undefined {
  if (statusQuery === undefined) {
    return undefined;
  }
  const raw = Array.isArray(statusQuery) ? statusQuery : [statusQuery];
  const allowed = new Set<string>(Object.values(AppointmentStatus));
  const parsed = raw
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
    .filter((s) => allowed.has(s)) as AppointmentStatus[];
  return parsed.length > 0 ? parsed : undefined;
}

export interface ScheduleDateRange {
  fromDate?: string;
  toDate?: string;
}

/**
 * Validates optional inclusive scheduled_date range for schedule queries.
 * Both bounds required together; must be YYYY-MM-DD; from ≤ to.
 */
export function parseScheduleDateRange(
  fromDate?: string,
  toDate?: string,
): ScheduleDateRange {
  if (!fromDate && !toDate) {
    return {};
  }
  if (!fromDate || !toDate) {
    throw new BadRequestException(
      'from_date and to_date must both be provided together',
    );
  }
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(fromDate) || !ymd.test(toDate)) {
    throw new BadRequestException(
      'from_date and to_date must be YYYY-MM-DD',
    );
  }
  if (fromDate > toDate) {
    throw new BadRequestException('from_date must be on or before to_date');
  }
  return { fromDate, toDate };
}
