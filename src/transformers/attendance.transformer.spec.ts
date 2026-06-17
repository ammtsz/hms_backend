import { AttendanceTransformer } from './attendance.transformer';
import { Attendance } from '../entities/attendance.entity';
import { AttendanceType, AttendanceStatus } from '../common/enums';

describe('AttendanceTransformer', () => {
  const mockAttendance: Partial<Attendance> = {
    id: 1,
    patient_id: 1,
    type: AttendanceType.ASSESSMENT,
    status: AttendanceStatus.SCHEDULED,
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
    it('should transform an attendance entity to response dto', () => {
      const result = AttendanceTransformer.toResponseDto(
        mockAttendance as Attendance,
      );

      expect(result).toEqual({
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        status: AttendanceStatus.SCHEDULED,
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
      const attendanceWithNullDates: Partial<Attendance> = {
        ...mockAttendance,
        checked_in_time: null,
        started_time: null,
        completed_time: null,
      };

      const result = AttendanceTransformer.toResponseDto(
        attendanceWithNullDates as Attendance,
      );

      expect(result.checked_in_time).toBeNull();
      expect(result.started_time).toBeNull();
      expect(result.completed_time).toBeNull();
    });
  });

  describe('toResponseDtoList', () => {
    it('should transform an array of attendance entities to response dtos', () => {
      const attendances = [mockAttendance, mockAttendance] as Attendance[];
      const results = AttendanceTransformer.toResponseDtoList(attendances);

      expect(results).toHaveLength(2);
      results.forEach((result) => {
        expect(result).toEqual({
          id: 1,
          patient_id: 1,
          type: AttendanceType.ASSESSMENT,
          status: AttendanceStatus.SCHEDULED,
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
      const results = AttendanceTransformer.toResponseDtoList([]);
      expect(results).toEqual([]);
    });
  });
});
