import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class AppointmentScheduleConflictException extends BaseException {
  constructor(patientId: number, scheduledDate: string, scheduledTime: string) {
    super(
      `Schedule conflict: Patient ${patientId} already has an appointment scheduled for ${scheduledDate} at ${scheduledTime}`,
      'Schedule Conflict',
      HttpStatus.CONFLICT,
      { patientId, scheduledDate, scheduledTime },
    );
  }
}

export class InvalidAppointmentStatusTransitionException extends BaseException {
  constructor(
    appointmentId: number,
    currentStatus: string,
    targetStatus: string,
  ) {
    super(
      `Invalid status transition for appointment ${appointmentId}: Cannot change from '${currentStatus}' to '${targetStatus}'`,
      'Invalid Status Transition',
      HttpStatus.BAD_REQUEST,
      { appointmentId, currentStatus, targetStatus },
    );
  }
}

export class AppointmentTimeSlotUnavailableException extends BaseException {
  constructor(date: string, time: string, type: string) {
    super(
      `No available slots for ${type} appointment on ${date} at ${time}`,
      'Time Slot Unavailable',
      HttpStatus.CONFLICT,
      { date, time, type },
    );
  }
}
