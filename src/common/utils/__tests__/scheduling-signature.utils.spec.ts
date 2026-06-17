import { AttendanceType } from '../../enums';
import {
  normalizeSchedulingKey,
  treatmentSignaturesConflict,
} from '../scheduling-signature.utils';

describe('scheduling-signature.utils', () => {
  describe('normalizeSchedulingKey', () => {
    it('trims and lowercases', () => {
      expect(normalizeSchedulingKey('  Cervical ')).toBe('cervical');
    });
  });

  describe('treatmentSignaturesConflict', () => {
    it('returns true for tens with same location', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.TENS,
          { bodyLocation: 'Cervical' },
          { bodyLocation: 'cervical' },
        ),
      ).toBe(true);
    });

    it('returns false for tens with different locations', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.TENS,
          { bodyLocation: 'Cervical' },
          { bodyLocation: 'Frontal' },
        ),
      ).toBe(false);
    });

    it('returns true for physiotherapy with same location and color', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.PHYSIOTHERAPY,
          { bodyLocation: 'Cervical', color: 'Azul' },
          { bodyLocation: 'Cervical', color: 'azul' },
        ),
      ).toBe(true);
    });

    it('returns false for physiotherapy with same location but different color', () => {
      expect(
        treatmentSignaturesConflict(
          AttendanceType.PHYSIOTHERAPY,
          { bodyLocation: 'Cervical', color: 'Azul' },
          { bodyLocation: 'Cervical', color: 'Vermelho' },
        ),
      ).toBe(false);
    });
  });
});
