import {
  DuplicatePatientException,
  InvalidPatientPriorityException,
  PatientStatusUpdateException,
  PatientHasActiveAppointmentsException,
} from '../patient.exceptions';
import { HttpStatus } from '@nestjs/common';

describe('Patient Exceptions', () => {
  describe('DuplicatePatientException', () => {
    it('should create exception with correct message and status', () => {
      const exception = new DuplicatePatientException(
        'John Doe',
        '(555) 123-4567',
        123,
      );

      expect(exception.message).toContain('John Doe');
      expect(exception.message).toContain('(555) 123-4567');
      expect(exception.message).toContain('123');
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Duplicate Patient');
      expect(response.details).toEqual({
        patientName: 'John Doe',
        phone: '(555) 123-4567',
        existingPatientId: 123,
      });
    });

    it('should be instance of Error', () => {
      const exception = new DuplicatePatientException(
        'Jane Doe',
        '(555) 987-6543',
        456,
      );

      expect(exception).toBeInstanceOf(Error);
    });
  });

  describe('InvalidPatientPriorityException', () => {
    it('should create exception with correct message and status', () => {
      const allowedPriorities = ['EMERGENCY', 'INTERMEDIATE', 'NORMAL'];
      const exception = new InvalidPatientPriorityException(
        'INVALID',
        allowedPriorities,
      );

      expect(exception.message).toContain('INVALID');
      expect(exception.message).toContain('EMERGENCY, INTERMEDIATE, NORMAL');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Invalid Priority');
      expect(response.details).toEqual({
        priority: 'INVALID',
        allowedPriorities,
      });
    });

    it('should handle empty allowed priorities array', () => {
      const exception = new InvalidPatientPriorityException('INVALID', []);

      expect(exception.message).toContain('INVALID');

      const response = exception.getResponse() as any;
      expect(response.details.allowedPriorities).toEqual([]);
    });
  });

  describe('PatientStatusUpdateException', () => {
    it('should create exception with correct message and status', () => {
      const exception = new PatientStatusUpdateException(
        123,
        'IN_TREATMENT',
        'DISCHARGED',
        'Patient has pending appointments',
      );

      expect(exception.message).toContain('123');
      expect(exception.message).toContain('IN_TREATMENT');
      expect(exception.message).toContain('DISCHARGED');
      expect(exception.message).toContain('Patient has pending appointments');
      expect(exception.getStatus()).toBe(HttpStatus.BAD_REQUEST);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Invalid Status Update');
      expect(response.details).toEqual({
        patientId: 123,
        currentStatus: 'IN_TREATMENT',
        targetStatus: 'DISCHARGED',
        reason: 'Patient has pending appointments',
      });
    });

    it('should handle different status combinations', () => {
      const exception = new PatientStatusUpdateException(
        456,
        'DISCHARGED',
        'IN_TREATMENT',
        'Cannot reactivate discharged patient',
      );

      expect(exception.message).toContain('456');
      expect(exception.message).toContain('DISCHARGED');
      expect(exception.message).toContain('IN_TREATMENT');
      expect(exception.message).toContain(
        'Cannot reactivate discharged patient',
      );
    });
  });

  describe('PatientHasActiveAppointmentsException', () => {
    it('should create exception with correct message and status', () => {
      const exception = new PatientHasActiveAppointmentsException(123, 5);

      expect(exception.message).toContain('123');
      expect(exception.message).toContain('5');
      expect(exception.getStatus()).toBe(HttpStatus.CONFLICT);

      const response = exception.getResponse() as any;
      expect(response.error).toBe('Active Appointments Exist');
      expect(response.details).toEqual({
        patientId: 123,
        activeAppointmentsCount: 5,
      });
    });

    it('should handle single active appointment', () => {
      const exception = new PatientHasActiveAppointmentsException(456, 1);

      expect(exception.message).toContain('456');
      expect(exception.message).toContain('1');

      const response = exception.getResponse() as any;
      expect(response.details.activeAppointmentsCount).toBe(1);
    });

    it('should handle zero active appointments (edge case)', () => {
      const exception = new PatientHasActiveAppointmentsException(789, 0);

      expect(exception.message).toContain('789');
      expect(exception.message).toContain('0');

      const response = exception.getResponse() as any;
      expect(response.details.activeAppointmentsCount).toBe(0);
    });
  });
});
