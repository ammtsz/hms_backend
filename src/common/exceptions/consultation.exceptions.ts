import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class DuplicateConsultationException extends BaseException {
  constructor(attendanceId: number, existingConsultationId: number) {
    super(
      `Cannot create consultation: Attendance (ID: ${attendanceId}) already has a consultation (ID: ${existingConsultationId})`,
      'Duplicate Consultation',
      HttpStatus.CONFLICT,
      { attendanceId, existingConsultationId },
    );
  }
}

export class InvalidAttendanceStatusException extends BaseException {
  constructor(attendanceId: number, status: string) {
    super(
      `Cannot create consultation: Attendance (ID: ${attendanceId}) has invalid status: ${status}`,
      'Invalid Attendance Status',
      HttpStatus.BAD_REQUEST,
      { attendanceId, status },
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
