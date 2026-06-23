import { HttpStatus } from '@nestjs/common';
import {
  InvalidScheduleTimeException,
  ScheduleSettingConflictException,
  InvalidConcurrentAppointmentsException,
  ScheduleSettingInUseException,
} from '../schedule-setting.exceptions';

describe('Schedule Setting Exceptions', () => {
  describe('InvalidScheduleTimeException', () => {
    it('should create exception with correct message and properties', () => {
      const startTime = '08:00';
      const endTime = '17:00';
      const reason = 'End time must be after start time';

      const exception = new InvalidScheduleTimeException(
        startTime,
        endTime,
        reason,
      );

      expect(exception.message).toBe(
        `Invalid schedule time: ${startTime} - ${endTime}. ${reason}`,
      );
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Invalid Schedule Time');
      expect(response.details).toEqual({
        startTime,
        endTime,
        reason,
      });
    });

    it('should handle empty reason string', () => {
      const exception = new InvalidScheduleTimeException('09:00', '18:00', '');

      expect(exception.message).toBe('Invalid schedule time: 09:00 - 18:00. ');

      const response = exception.getResponse() as any;
      expect(response.details.reason).toBe('');
    });
  });

  describe('ScheduleSettingConflictException', () => {
    it('should create exception with correct message and properties', () => {
      const dayOfWeek = 1; // Monday
      const existingSettingId = 123;

      const exception = new ScheduleSettingConflictException(
        dayOfWeek,
        existingSettingId,
      );

      expect(exception.message).toBe(
        `Schedule setting for day ${dayOfWeek} already exists (ID: ${existingSettingId})`,
      );
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Schedule Setting Conflict');
      expect(response.details).toEqual({
        dayOfWeek,
        existingSettingId,
      });
    });

    it('should handle edge case day values', () => {
      const exception = new ScheduleSettingConflictException(0, 999);

      expect(exception.message).toBe(
        'Schedule setting for day 0 already exists (ID: 999)',
      );

      const response = exception.getResponse() as any;
      expect(response.details.dayOfWeek).toBe(0);
      expect(response.details.existingSettingId).toBe(999);
    });
  });

  describe('InvalidConcurrentAppointmentsException', () => {
    it('should create exception with correct message and properties', () => {
      const type = 'assessment';
      const requestedCount = 5;
      const maxAllowed = 3;

      const exception = new InvalidConcurrentAppointmentsException(
        type,
        requestedCount,
        maxAllowed,
      );

      expect(exception.message).toBe(
        `Invalid concurrent ${type} appointments: ${requestedCount} requested, maximum allowed is ${maxAllowed}`,
      );
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Invalid Concurrent Appointments');
      expect(response.details).toEqual({
        type,
        requestedCount,
        maxAllowed,
      });
    });

    it('should handle physiotherapy type', () => {
      const exception = new InvalidConcurrentAppointmentsException(
        'physiotherapy',
        2,
        1,
      );

      expect(exception.message).toContain('physiotherapy appointments');

      const response = exception.getResponse() as any;
      expect(response.details.type).toBe('physiotherapy');
    });

    it('should handle zero values', () => {
      const exception = new InvalidConcurrentAppointmentsException(
        'assessment',
        0,
        0,
      );

      expect(exception.message).toBe(
        'Invalid concurrent assessment appointments: 0 requested, maximum allowed is 0',
      );

      const response = exception.getResponse() as any;
      expect(response.details.requestedCount).toBe(0);
      expect(response.details.maxAllowed).toBe(0);
    });
  });

  describe('ScheduleSettingInUseException', () => {
    it('should create exception with correct message and properties', () => {
      const settingId = 42;
      const activeAppointmentsCount = 5;

      const exception = new ScheduleSettingInUseException(
        settingId,
        activeAppointmentsCount,
      );

      expect(exception.message).toBe(
        `Cannot delete schedule setting ${settingId}: Has ${activeAppointmentsCount} active appointments`,
      );
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Setting In Use');
      expect(response.details).toEqual({
        settingId,
        activeAppointmentsCount,
      });
    });

    it('should handle single active appointment', () => {
      const exception = new ScheduleSettingInUseException(1, 1);

      expect(exception.message).toBe(
        'Cannot delete schedule setting 1: Has 1 active appointments',
      );

      const response = exception.getResponse() as any;
      expect(response.details.activeAppointmentsCount).toBe(1);
    });

    it('should handle zero active appointments', () => {
      const exception = new ScheduleSettingInUseException(99, 0);

      expect(exception.message).toBe(
        'Cannot delete schedule setting 99: Has 0 active appointments',
      );

      const response = exception.getResponse() as any;
      expect(response.details.activeAppointmentsCount).toBe(0);
    });
  });
});
