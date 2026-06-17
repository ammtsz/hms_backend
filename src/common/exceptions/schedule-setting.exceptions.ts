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

export class InvalidConcurrentAttendancesException extends BaseException {
  constructor(type: string, requestedCount: number, maxAllowed: number) {
    super(
      `Invalid concurrent ${type} attendances: ${requestedCount} requested, maximum allowed is ${maxAllowed}`,
      'Invalid Concurrent Attendances',
      HttpStatus.BAD_REQUEST,
      { type, requestedCount, maxAllowed },
    );
  }
}

export class ScheduleSettingInUseException extends BaseException {
  constructor(settingId: number, activeAttendancesCount: number) {
    super(
      `Cannot delete schedule setting ${settingId}: Has ${activeAttendancesCount} active attendances`,
      'Setting In Use',
      HttpStatus.CONFLICT,
      { settingId, activeAttendancesCount },
    );
  }
}
