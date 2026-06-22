import { AttendanceType } from '../../enums';
import {
  normalizeSchedulingKey,
  treatmentSignaturesConflict,
} from '../scheduling-signature.utils';

describe('scheduling-signature.utils', () => {
  describe('normalizeSchedulingKey', () => {
    it('trims and lowercases', () => {
      expect(normalizeSchedulingKey('  Neck ')).toBe('neck');
    });
  });

  describe('treatmentSignaturesConflict', () => {
    it('returns true for tens with same location', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.TENS,
          { bodyLocation: 'Neck' },
          { bodyLocation: 'neck' },
        ),
      ).toBe(true);
    });

    it('returns false for tens with different locations', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.TENS,
          { bodyLocation: 'Neck' },
          { bodyLocation: 'Left Shoulder' },
        ),
      ).toBe(false);
    });

    it('returns true for physiotherapy with same location and color', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.PHYSIOTHERAPY,
          { bodyLocation: 'Neck', color: 'Blue' },
          { bodyLocation: 'Neck', color: 'blue' },
        ),
      ).toBe(true);
    });

    it('returns false for physiotherapy with same location but different color', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.PHYSIOTHERAPY,
          { bodyLocation: 'Neck', color: 'Blue' },
          { bodyLocation: 'Neck', color: 'Red' },
        ),
      ).toBe(false);
    });
  });
});
