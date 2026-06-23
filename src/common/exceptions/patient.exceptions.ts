import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class DuplicatePatientException extends BaseException {
  constructor(patientName: string, phone: string, existingPatientId: number) {
    super(
      `A patient with name '${patientName}' and phone '${phone}' already exists (ID: ${existingPatientId})`,
      'Duplicate Patient',
      HttpStatus.CONFLICT,
      { patientName, phone, existingPatientId },
    );
  }
}

export class InvalidPatientPriorityException extends BaseException {
  constructor(priority: string, allowedPriorities: string[]) {
    super(
      `Invalid patient priority: ${priority}. Allowed priorities are: ${allowedPriorities.join(', ')}`,
      'Invalid Priority',
      HttpStatus.BAD_REQUEST,
      { priority, allowedPriorities },
    );
  }
}

export class PatientStatusUpdateException extends BaseException {
  constructor(
    patientId: number,
    currentStatus: string,
    targetStatus: string,
    reason: string,
  ) {
    super(
      `Cannot update patient ${patientId} status from '${currentStatus}' to '${targetStatus}': ${reason}`,
      'Invalid Status Update',
      HttpStatus.BAD_REQUEST,
      { patientId, currentStatus, targetStatus, reason },
    );
  }
}

export class PatientHasActiveAppointmentsException extends BaseException {
  constructor(patientId: number, activeAppointmentsCount: number) {
    super(
      `Cannot delete patient ${patientId}: Has ${activeAppointmentsCount} active appointments`,
      'Active Appointments Exist',
      HttpStatus.CONFLICT,
      { patientId, activeAppointmentsCount },
    );
  }
}
