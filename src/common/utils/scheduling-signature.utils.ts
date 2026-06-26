import { AppointmentType } from '../enums';

/** Body location used for same-day treatment uniqueness (BR-306). */
export interface TreatmentSchedulingSignature {
  bodyLocation: string;
}

export function normalizeSchedulingKey(value: string): string {
  return value.toLowerCase().trim();
}

export function treatmentSignaturesConflict(
  _type: AppointmentType.PHYSIOTHERAPY | AppointmentType.TENS,
  a: TreatmentSchedulingSignature,
  b: TreatmentSchedulingSignature,
): boolean {
  return (
    normalizeSchedulingKey(a.bodyLocation) ===
    normalizeSchedulingKey(b.bodyLocation)
  );
}
