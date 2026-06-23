import { BadRequestException } from '@nestjs/common';
import { AppointmentStatus } from '../../enums';
import {
  parseScheduleDateRange,
  parseScheduleStatusQuery,
} from '../schedule-query.utils';

describe('schedule-query.utils', () => {
  describe('parseScheduleStatusQuery', () => {
    it('returns undefined when status query is omitted', () => {
      expect(parseScheduleStatusQuery(undefined)).toBeUndefined();
    });

    it('parses a single valid status', () => {
      expect(parseScheduleStatusQuery('scheduled')).toEqual([
        AppointmentStatus.SCHEDULED,
      ]);
    });

    it('trims and filters invalid values', () => {
      expect(
        parseScheduleStatusQuery(['  scheduled  ', 'invalid', 'completed']),
      ).toEqual([AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED]);
    });

    it('returns undefined when no valid statuses remain', () => {
      expect(parseScheduleStatusQuery(['nope'])).toBeUndefined();
    });
  });

  describe('parseScheduleDateRange', () => {
    it('returns empty object when both omitted', () => {
      expect(parseScheduleDateRange()).toEqual({});
      expect(parseScheduleDateRange(undefined, undefined)).toEqual({});
    });

    it('returns range when both valid YYYY-MM-DD', () => {
      expect(parseScheduleDateRange('2025-07-01', '2025-07-31')).toEqual({
        fromDate: '2025-07-01',
        toDate: '2025-07-31',
      });
    });

    it('throws when only one bound is provided', () => {
      expect(() => parseScheduleDateRange('2025-07-01', undefined)).toThrow(
        BadRequestException,
      );
      expect(() => parseScheduleDateRange(undefined, '2025-07-31')).toThrow(
        BadRequestException,
      );
    });

    it('throws when format is not YYYY-MM-DD', () => {
      expect(() =>
        parseScheduleDateRange('2025-7-1', '2025-07-31'),
      ).toThrow(BadRequestException);
    });

    it('throws when from_date is after to_date', () => {
      expect(() =>
        parseScheduleDateRange('2025-07-31', '2025-07-01'),
      ).toThrow(BadRequestException);
    });
  });
});
