import { AppointmentTransformer } from './appointment.transformer';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentType, AppointmentStatus } from '../common/enums';

describe('AppointmentTransformer', () => {
  const mockAppointment: Partial<Appointment> = {
    id: 1,
    patient_id: 1,
    type: AppointmentType.ASSESSMENT,
    status: AppointmentStatus.SCHEDULED,
    scheduled_date: '2025-07-22',
    scheduled_time: '14:30',
    checked_in_time: '14:25:00',
    started_time: '14:35:00',
    completed_time: '15:00:00',
    cancelled_date: null,
    cancelled_time: null,
    notes: 'Test notes',
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  };

  describe('toResponseDto', () => {
    it('should transform an appointment entity to response dto', () => {
      const result = AppointmentTransformer.toResponseDto(
        mockAppointment as Appointment,
      );

      expect(result).toEqual({
        id: 1,
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        status: AppointmentStatus.SCHEDULED,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        checked_in_time: '14:25:00',
        started_time: '14:35:00',
        completed_time: '15:00:00',
        cancelled_date: null,
        absence_justified: undefined,
        absence_notes: undefined,
        notes: 'Test notes',
        created_at: '2025-07-22T09:00:00',
        updated_at: '2025-07-22T09:00:00',
      });
    });

    it('should handle null dates correctly', () => {
      const appointmentWithNullDates: Partial<Appointment> = {
        ...mockAppointment,
        checked_in_time: null,
        started_time: null,
        completed_time: null,
      };

      const result = AppointmentTransformer.toResponseDto(
        appointmentWithNullDates as Appointment,
      );

      expect(result.checked_in_time).toBeNull();
      expect(result.started_time).toBeNull();
      expect(result.completed_time).toBeNull();
    });
  });

  describe('toResponseDtoList', () => {
    it('should transform an array of appointment entities to response dtos', () => {
      const appointments = [mockAppointment, mockAppointment] as Appointment[];
      const results = AppointmentTransformer.toResponseDtoList(appointments);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result).toEqual({
          id: 1,
          patient_id: 1,
          type: AppointmentType.ASSESSMENT,
          status: AppointmentStatus.SCHEDULED,
          scheduled_date: '2025-07-22',
          scheduled_time: '14:30',
          checked_in_time: '14:25:00',
          started_time: '14:35:00',
          completed_time: '15:00:00',
          cancelled_date: null,
          absence_justified: undefined,
          absence_notes: undefined,
          notes: 'Test notes',
          created_at: '2025-07-22T09:00:00',
          updated_at: '2025-07-22T09:00:00',
        });
      });
    });

    it('should return empty array when input is empty', () => {
      const results = AppointmentTransformer.toResponseDtoList([]);
      expect(results).toEqual([]);
    });
  });
});
