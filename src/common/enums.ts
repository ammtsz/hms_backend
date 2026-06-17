export enum PatientPriority {
  LEVEL_1 = '1',
  LEVEL_2 = '2',
  LEVEL_3 = '3',
  LEVEL_4 = '4',
  LEVEL_5 = '5',
}

/** Patient lifecycle (`hms_patient.patient_status`, `PATIENT_STATUS`). */
export enum PatientStatus {
  NEW_PATIENT = 'N',
  IN_TREATMENT = 'T',
  DISCHARGED = 'A',
  ABSENT = 'F',
}

export enum AttendanceType {
  ASSESSMENT = 'assessment',
  PHYSIOTHERAPY = 'physiotherapy',
  TENS = 'tens',
}

export enum AttendanceStatus {
  SCHEDULED = 'scheduled',
  CHECKED_IN = 'checked_in',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  MISSED = 'missed',
}
