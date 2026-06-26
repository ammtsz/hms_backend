import { AppointmentType } from '../../enums';
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
          AppointmentType.TENS,
          { bodyLocation: 'Neck' },
          { bodyLocation: 'neck' },
        ),
      ).toBe(true);
    });

    it('returns false for tens with different locations', () => {
      expect(
        treatmentSignaturesConflict(
          AppointmentType.TENS,
          { bodyLocation: 'Neck' },
          { bodyLocation: 'Left Shoulder' },
        ),
      ).toBe(false);
    });

    it('returns true for physiotherapy with same location', () => {
      expect(
        treatmentSignaturesConflict(
          AppointmentType.PHYSIOTHERAPY,
          { bodyLocation: 'Neck' },
          { bodyLocation: 'Neck' },
        ),
      ).toBe(true);
    });

    it('returns false for physiotherapy with different locations', () => {
      expect(
        treatmentSignaturesConflict(
          AppointmentType.PHYSIOTHERAPY,
          { bodyLocation: 'Neck' },
          { bodyLocation: 'Left Shoulder' },
        ),
      ).toBe(false);
    });
  });
});
