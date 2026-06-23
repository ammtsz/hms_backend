import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class DuplicateConsultationException extends BaseException {
  constructor(appointmentId: number, existingConsultationId: number) {
    super(
      `Cannot create consultation: Appointment (ID: ${appointmentId}) already has a consultation (ID: ${existingConsultationId})`,
      'Duplicate Consultation',
      HttpStatus.CONFLICT,
      { appointmentId, existingConsultationId },
    );
  }
}

export class InvalidAppointmentStatusException extends BaseException {
  constructor(appointmentId: number, status: string) {
    super(
      `Cannot create consultation: Appointment (ID: ${appointmentId}) has invalid status: ${status}`,
      'Invalid Appointment Status',
      HttpStatus.BAD_REQUEST,
      { appointmentId, status },
    );
  }
}

export class InvalidReturnWeeksException extends BaseException {
  constructor(weeks: number) {
    super(
      `Return weeks must be between 0 and 52, got: ${weeks}`,
      'Invalid Return Weeks',
      HttpStatus.BAD_REQUEST,
      { weeks },
    );
  }
}
