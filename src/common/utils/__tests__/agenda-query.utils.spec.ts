import { BadRequestException } from '@nestjs/common';
import { AttendanceStatus } from '../../enums';
import {
  parseAgendaDateRange,
  parseAgendaStatusQuery,
} from '../agenda-query.utils';

describe('agenda-query.utils', () => {
  describe('parseAgendaStatusQuery', () => {
    it('returns undefined when status query is omitted', () => {
      expect(parseAgendaStatusQuery(undefined)).toBeUndefined();
    });

    it('parses a single valid status', () => {
      expect(parseAgendaStatusQuery('scheduled')).toEqual([
        AttendanceStatus.SCHEDULED,
      ]);
    });

    it('trims and filters invalid values', () => {
      expect(
        parseAgendaStatusQuery(['  scheduled  ', 'invalid', 'completed']),
      ).toEqual([AttendanceStatus.SCHEDULED, AttendanceStatus.COMPLETED]);
    });

    it('returns undefined when no valid statuses remain', () => {
      expect(parseAgendaStatusQuery(['nope'])).toBeUndefined();
    });
  });

  describe('parseAgendaDateRange', () => {
    it('returns empty object when both omitted', () => {
      expect(parseAgendaDateRange()).toEqual({});
      expect(parseAgendaDateRange(undefined, undefined)).toEqual({});
    });

    it('returns range when both valid YYYY-MM-DD', () => {
      expect(parseAgendaDateRange('2025-07-01', '2025-07-31')).toEqual({
        fromDate: '2025-07-01',
        toDate: '2025-07-31',
      });
    });

    it('throws when only one bound is provided', () => {
      expect(() => parseAgendaDateRange('2025-07-01', undefined)).toThrow(
        BadRequestException,
      );
      expect(() => parseAgendaDateRange(undefined, '2025-07-31')).toThrow(
        BadRequestException,
      );
    });

    it('throws when format is not YYYY-MM-DD', () => {
      expect(() =>
        parseAgendaDateRange('2025-7-1', '2025-07-31'),
      ).toThrow(BadRequestException);
    });

    it('throws when from_date is after to_date', () => {
      expect(() =>
        parseAgendaDateRange('2025-07-31', '2025-07-01'),
      ).toThrow(BadRequestException);
    });
  });
});
