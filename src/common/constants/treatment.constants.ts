/** Allowed session durations (minutes) for physiotherapy and TENS treatment plans. */
export const TREATMENT_SESSION_DURATIONS = [30, 45, 60] as const;

export type TreatmentSessionDuration =
  (typeof TREATMENT_SESSION_DURATIONS)[number];

export const DEFAULT_PHYSIOTHERAPY_DURATION_MINUTES = 45;
export const DEFAULT_TENS_DURATION_MINUTES = 30;
