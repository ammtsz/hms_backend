import { AttendanceType } from '../enums';

/** Body location (+ color for physiotherapy) used for same-day uniqueness (BR-306). */
export interface TreatmentSchedulingSignature {
  bodyLocation: string;
  color?: string;
}

export function normalizeSchedulingKey(value: string): string {
  return value.toLowerCase().trim();
}

export function treatmentSignaturesConflict(
  type: AttendanceType.PHYSIOTHERAPY | AttendanceType.TENS,
  a: TreatmentSchedulingSignature,
  b: TreatmentSchedulingSignature,
): boolean {
  const locA = normalizeSchedulingKey(a.bodyLocation);
  const locB = normalizeSchedulingKey(b.bodyLocation);
  if (locA !== locB) {
    return false;
  }
  if (type === AttendanceType.TENS) {
    return true;
  }
  return (
    normalizeSchedulingKey(a.color ?? '') ===
    normalizeSchedulingKey(b.color ?? '')
  );
}
