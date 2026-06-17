import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class AttendanceScheduleConflictException extends BaseException {
  constructor(patientId: number, scheduledDate: string, scheduledTime: string) {
    super(
      `Schedule conflict: Patient ${patientId} already has an attendance scheduled for ${scheduledDate} at ${scheduledTime}`,
      'Schedule Conflict',
      HttpStatus.CONFLICT,
      { patientId, scheduledDate, scheduledTime },
    );
  }
}

export class InvalidAttendanceStatusTransitionException extends BaseException {
  constructor(
    attendanceId: number,
    currentStatus: string,
    targetStatus: string,
  ) {
    super(
      `Invalid status transition for attendance ${attendanceId}: Cannot change from '${currentStatus}' to '${targetStatus}'`,
      'Invalid Status Transition',
      HttpStatus.BAD_REQUEST,
      { attendanceId, currentStatus, targetStatus },
    );
  }
}

export class AttendanceTimeSlotUnavailableException extends BaseException {
  constructor(date: string, time: string, type: string) {
    super(
      `No available slots for ${type} attendance on ${date} at ${time}`,
      'Time Slot Unavailable',
      HttpStatus.CONFLICT,
      { date, time, type },
    );
  }
}
