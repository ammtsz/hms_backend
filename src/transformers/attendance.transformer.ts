import { Attendance } from '../entities/attendance.entity';
import {
  AttendanceResponseDto,
  AttendanceAgendaDto,
  NextAttendanceDateDto,
} from '../dtos/attendance.dto';
import { combineDateTimeToTimestamp } from '../utils/datetime-helpers';

export class AttendanceTransformer {
  static toResponseDto(attendance: Attendance): AttendanceResponseDto {
    const response: AttendanceResponseDto = {
      id: attendance.id,
      patient_id: attendance.patient_id,
      type: attendance.type,
      status: attendance.status,
      scheduled_date: attendance.scheduled_date, // Already stored as string in YYYY-MM-DD format
      scheduled_time: attendance.scheduled_time,
      // Use only time fields (all status changes happen on the scheduled_date)
      checked_in_time: attendance.checked_in_time,
      started_time: attendance.started_time,
      completed_time: attendance.completed_time,
      // Only cancellation might happen on a different date
      cancelled_date: attendance.cancelled_date,
      absence_justified: attendance.absence_justified,
      absence_notes: attendance.absence_notes,
      notes: attendance.notes,
      // Convert created/updated date/time pairs back to timestamp strings
      created_at: combineDateTimeToTimestamp(
        attendance.created_date,
        attendance.created_time,
      ),
      updated_at: combineDateTimeToTimestamp(
        attendance.updated_date,
        attendance.updated_time,
      ),
    };

    // Include patient data if available
    if (attendance.patient) {
      response.patient = {
        id: attendance.patient.id,
        name: attendance.patient.name,
        phone: attendance.patient.phone,
        priority: attendance.patient.priority,
        patient_status: attendance.patient.patient_status,
        birth_date: attendance.patient.birth_date,
        main_concern: attendance.patient.main_concern,
        start_date: attendance.patient.start_date,
        discharge_date: attendance.patient.discharge_date,
        missing_appointments_streak:
          attendance.patient.missing_appointments_streak,
        timezone: attendance.patient.timezone,
        created_date: attendance.patient.created_date,
        created_time: attendance.patient.created_time,
        updated_date: attendance.patient.updated_date,
        updated_time: attendance.patient.updated_time,
      };
    }

    return response;
  }

  static toResponseDtoList(attendances: Attendance[]): AttendanceResponseDto[] {
    return attendances.map((attendance) => this.toResponseDto(attendance));
  }

  // Transform raw query result to agenda DTO
  static toAgendaDto(rawData: any): AttendanceAgendaDto {
    return {
      id: rawData.attendance_id,
      patient_id: rawData.attendance_patient_id,
      type: rawData.attendance_type,
      status: rawData.attendance_status,
      scheduled_date:
        rawData.attendance_scheduled_date instanceof Date
          ? rawData.attendance_scheduled_date.toISOString().split('T')[0]
          : rawData.attendance_scheduled_date,
      notes: rawData.attendance_notes,
      patient_name:
        rawData.patient_name || `Patient ${rawData.attendance_patient_id}`,
      patient_priority: rawData.patient_priority || 'NORMAL',
    };
  }

  static toAgendaDtoList(rawDataList: any[]): AttendanceAgendaDto[] {
    return rawDataList.map((rawData) => this.toAgendaDto(rawData));
  }

  // Transform date string to next attendance date DTO
  static toNextDateDto(dateString: string | null): NextAttendanceDateDto {
    return {
      next_date: dateString || new Date().toISOString().split('T')[0],
    };
  }
}
