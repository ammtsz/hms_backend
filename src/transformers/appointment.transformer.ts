import { Appointment } from '../entities/appointment.entity';
import {
  AppointmentResponseDto,
  AppointmentScheduleDto,
  NextAppointmentDateDto,
} from '../dtos/appointment.dto';
import { combineDateTimeToTimestamp } from '../utils/datetime-helpers';

export class AppointmentTransformer {
  static toResponseDto(appointment: Appointment): AppointmentResponseDto {
    const response: AppointmentResponseDto = {
      id: appointment.id,
      patient_id: appointment.patient_id,
      type: appointment.type,
      status: appointment.status,
      scheduled_date: appointment.scheduled_date, // Already stored as string in YYYY-MM-DD format
      scheduled_time: appointment.scheduled_time,
      // Use only time fields (all status changes happen on the scheduled_date)
      checked_in_time: appointment.checked_in_time,
      started_time: appointment.started_time,
      completed_time: appointment.completed_time,
      // Only cancellation might happen on a different date
      cancelled_date: appointment.cancelled_date,
      absence_justified: appointment.absence_justified,
      absence_notes: appointment.absence_notes,
      notes: appointment.notes,
      // Convert created/updated date/time pairs back to timestamp strings
      created_at: combineDateTimeToTimestamp(
        appointment.created_date,
        appointment.created_time,
      ),
      updated_at: combineDateTimeToTimestamp(
        appointment.updated_date,
        appointment.updated_time,
      ),
    };

    // Include patient data if available
    if (appointment.patient) {
      response.patient = {
        id: appointment.patient.id,
        name: appointment.patient.name,
        phone: appointment.patient.phone,
        priority: appointment.patient.priority,
        patient_status: appointment.patient.patient_status,
        birth_date: appointment.patient.birth_date,
        main_concern: appointment.patient.main_concern,
        start_date: appointment.patient.start_date,
        discharge_date: appointment.patient.discharge_date,
        missing_appointments_streak:
          appointment.patient.missing_appointments_streak,
        created_date: appointment.patient.created_date,
        created_time: appointment.patient.created_time,
        updated_date: appointment.patient.updated_date,
        updated_time: appointment.patient.updated_time,
      };
    }

    return response;
  }

  static toResponseDtoList(appointments: Appointment[]): AppointmentResponseDto[] {
    return appointments.map((appointment) => this.toResponseDto(appointment));
  }

  // Transform raw query result to schedule DTO
  static toScheduleDto(rawData: any): AppointmentScheduleDto {
    return {
      id: rawData.appointment_id,
      patient_id: rawData.appointment_patient_id,
      type: rawData.appointment_type,
      status: rawData.appointment_status,
      scheduled_date:
        rawData.appointment_scheduled_date instanceof Date
          ? rawData.appointment_scheduled_date.toISOString().split('T')[0]
          : rawData.appointment_scheduled_date,
      notes: rawData.appointment_notes,
      patient_name:
        rawData.patient_name || `Patient ${rawData.appointment_patient_id}`,
      patient_priority: rawData.patient_priority || 'NORMAL',
    };
  }

  static toScheduleDtoList(rawDataList: any[]): AppointmentScheduleDto[] {
    return rawDataList.map((rawData) => this.toScheduleDto(rawData));
  }

  // Transform date string to next appointment date DTO
  static toNextDateDto(dateString: string | null): NextAppointmentDateDto {
    return {
      next_date: dateString || new Date().toISOString().split('T')[0],
    };
  }
}
