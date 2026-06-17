import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus } from '../enums';

/**
 * Parses repeated `status` query params for GET /attendances/agenda.
 * Unknown values are dropped; empty after filter → undefined (all statuses).
 */
export function parseAgendaStatusQuery(
  statusQuery?: string | string[],
): AttendanceStatus[] | undefined {
  if (statusQuery === undefined) {
    return undefined;
  }
  const raw = Array.isArray(statusQuery) ? statusQuery : [statusQuery];
  const allowed = new Set<string>(Object.values(AttendanceStatus));
  const parsed = raw
    .map((s) => s?.trim())
    .filter((s): s is string => Boolean(s))
    .filter((s) => allowed.has(s)) as AttendanceStatus[];
  return parsed.length > 0 ? parsed : undefined;
}

export interface AgendaDateRange {
  fromDate?: string;
  toDate?: string;
}

/**
 * Validates optional inclusive scheduled_date range for agenda queries.
 * Both bounds required together; must be YYYY-MM-DD; from ≤ to.
 */
export function parseAgendaDateRange(
  fromDate?: string,
  toDate?: string,
): AgendaDateRange {
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
