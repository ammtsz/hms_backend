import { HttpStatus } from '@nestjs/common';
import { BaseException } from './base.exception';

export class InvalidScheduleTimeException extends BaseException {
  constructor(startTime: string, endTime: string, reason: string) {
    super(
      `Invalid schedule time: ${startTime} - ${endTime}. ${reason}`,
      'Invalid Schedule Time',
      HttpStatus.BAD_REQUEST,
      { startTime, endTime, reason },
    );
  }
}

export class ScheduleSettingConflictException extends BaseException {
  constructor(dayOfWeek: number, existingSettingId: number) {
    super(
      `Schedule setting for day ${dayOfWeek} already exists (ID: ${existingSettingId})`,
      'Schedule Setting Conflict',
      HttpStatus.CONFLICT,
      { dayOfWeek, existingSettingId },
    );
  }
}

export class InvalidConcurrentAppointmentsException extends BaseException {
  constructor(type: string, requestedCount: number, maxAllowed: number) {
    super(
      `Invalid concurrent ${type} appointments: ${requestedCount} requested, maximum allowed is ${maxAllowed}`,
      'Invalid Concurrent Appointments',
      HttpStatus.BAD_REQUEST,
      { type, requestedCount, maxAllowed },
    );
  }
}

export class ScheduleSettingInUseException extends BaseException {
  constructor(settingId: number, activeAppointmentsCount: number) {
    super(
      `Cannot delete schedule setting ${settingId}: Has ${activeAppointmentsCount} active appointments`,
      'Setting In Use',
      HttpStatus.CONFLICT,
      { settingId, activeAppointmentsCount },
    );
  }
}
