import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  IsBoolean,
  IsArray,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AppointmentType, AppointmentStatus } from '../common/enums';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { PatientResponseDto } from './patient.dto';

export class CreateAppointmentDto {
  @ApiProperty({ description: 'Patient ID', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  patient_id: number;

  @ApiProperty({
    description: 'Type of appointment',
    enum: AppointmentType,
    example: AppointmentType.ASSESSMENT,
  })
  @IsEnum(AppointmentType)
  @IsNotEmpty()
  type: AppointmentType;

  @ApiProperty({
    description: 'Date of appointment',
    example: '2025-07-22',
    format: 'YYYY-MM-DD',
  })
  @IsDateString()
  @IsNotEmpty()
  scheduled_date: string;

  @ApiProperty({
    description: 'Time of appointment',
    example: '19:30',
    pattern: 'HH:mm',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm',
  })
  scheduled_time: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
    example: 'First consultation notes',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Parent appointment ID for linking follow-ups and generated treatments to original consultation',
    example: 123,
  })
  @IsNumber()
  @IsOptional()
  parent_appointment_id?: number;

  @ApiPropertyOptional({
    description: 'Initial status for the appointment (optional, defaults to scheduled)',
    enum: AppointmentStatus,
    example: AppointmentStatus.SCHEDULED,
  })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;
}

export class UpdateAppointmentDto {
  @ApiPropertyOptional({
    description: 'Updated type of appointment',
    enum: AppointmentType,
    example: AppointmentType.ASSESSMENT,
  })
  @IsEnum(AppointmentType)
  @IsOptional()
  type?: AppointmentType;

  @ApiPropertyOptional({
    description: 'Status of appointment',
    enum: AppointmentStatus,
    example: AppointmentStatus.IN_PROGRESS,
  })
  @IsEnum(AppointmentStatus)
  @IsOptional()
  status?: AppointmentStatus;

  @ApiPropertyOptional({
    description: 'Updated scheduled date',
    example: '2025-08-06',
    format: 'YYYY-MM-DD',
  })
  @IsDateString()
  @IsOptional()
  scheduled_date?: string;

  @ApiPropertyOptional({
    description: 'Updated scheduled time',
    example: '19:30',
    pattern: 'HH:mm',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm',
  })
  scheduled_time?: string;

  @ApiPropertyOptional({
    description: 'Check-in time',
    example: '19:30:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  checked_in_time?: string;

  @ApiPropertyOptional({
    description: 'Start time',
    example: '19:35:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  started_time?: string;

  @ApiPropertyOptional({
    description: 'Completion time',
    example: '20:00:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  completed_time?: string;

  @ApiPropertyOptional({
    description: 'Cancellation date',
    example: '2025-08-06',
    format: 'YYYY-MM-DD',
    nullable: true,
  })
  @IsDateString()
  @IsOptional()
  cancelled_date?: string;

  @ApiPropertyOptional({
    description: 'Whether the absence is justified',
    example: null,
    nullable: true,
  })
  @IsBoolean()
  @IsOptional()
  absence_justified?: boolean;

  @ApiPropertyOptional({
    description: 'Notes explaining the reason for absence',
    example: 'Patient had a medical emergency',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  absence_notes?: string;

  @ApiPropertyOptional({
    description: 'Updated notes',
    example: 'Patient reported improvement',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Parent appointment ID for linking follow-ups and generated treatments',
    example: 123,
  })
  @IsNumber()
  @IsOptional()
  parent_appointment_id?: number;
}

export class AppointmentResponseDto {
  @ApiProperty({ description: 'Appointment ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Patient ID', example: 1 })
  patient_id: number;

  @ApiProperty({
    description: 'Type of appointment',
    enum: AppointmentType,
    example: AppointmentType.ASSESSMENT,
  })
  type: AppointmentType;

  @ApiProperty({
    description: 'Status of appointment',
    enum: AppointmentStatus,
    example: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  @ApiProperty({
    description: 'Date of appointment',
    example: '2025-08-06',
    format: 'YYYY-MM-DD',
  })
  scheduled_date: string;

  @ApiProperty({
    description: 'Time of appointment',
    example: '19:30',
    pattern: 'HH:mm',
  })
  scheduled_time: string;

  @ApiPropertyOptional({
    description: 'Check-in time',
    example: '19:30:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  checked_in_time?: string;

  @ApiPropertyOptional({
    description: 'Start time',
    example: '19:35:00',
    pattern: 'HH:mm:ss',
  })
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  started_time?: string;

  @ApiPropertyOptional({
    description: 'Completion time',
    example: '20:00:00',
    pattern: 'HH:mm:ss',
  })
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  completed_time?: string;

  @ApiPropertyOptional({
    description: 'Cancellation date',
    example: '2025-08-06',
    nullable: true,
    type: 'string',
  })
  cancelled_date?: string;

  @ApiPropertyOptional({
    description: 'Whether the absence is justified',
    example: null,
    nullable: true,
  })
  absence_justified?: boolean;

  @ApiPropertyOptional({
    description: 'Notes explaining the reason for absence',
    example: 'Patient had a medical emergency',
  })
  absence_notes?: string;

  @ApiPropertyOptional({ description: 'Additional notes' })
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Parent appointment ID for linked follow-ups and generated treatments',
    example: 123,
  })
  parent_appointment_id?: number;

  @ApiProperty({
    description: 'Creation timestamp',
    example: '2025-08-06T19:30:00',
    type: 'string',
  })
  created_at: string;

  @ApiProperty({
    description: 'Last update timestamp',
    example: '2025-08-06T19:30:00',
    type: 'string',
  })
  updated_at: string;

  @ApiPropertyOptional({
    description: 'Patient information',
    type: () => PatientResponseDto,
  })
  patient?: PatientResponseDto;
}

// Simplified DTO for schedule view - contains only essential information
export class AppointmentScheduleDto {
  @ApiProperty({ description: 'Appointment ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Patient ID', example: 1 })
  patient_id: number;

  @ApiProperty({
    description: 'Type of appointment',
    enum: AppointmentType,
    example: AppointmentType.ASSESSMENT,
  })
  type: AppointmentType;

  @ApiProperty({
    description: 'Status of appointment',
    enum: AppointmentStatus,
    example: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  @ApiProperty({
    description: 'Date of appointment',
    example: '2025-07-29',
    format: 'YYYY-MM-DD',
  })
  scheduled_date: string;

  @ApiPropertyOptional({
    description: 'Additional notes',
  })
  notes?: string;

  @ApiProperty({
    description: 'Patient name',
    example: 'John Smith',
  })
  patient_name: string;

  @ApiProperty({
    description: 'Patient priority',
    example: 'NORMAL',
  })
  patient_priority: string;
}

// DTO for next scheduled appointment date
export class NextAppointmentDateDto {
  @ApiProperty({
    description: 'Next scheduled appointment date',
    example: '2025-07-30',
    format: 'YYYY-MM-DD',
  })
  next_date: string;
}

// DTO for one eligible parent appointment option (ongoing treatment root)
export class EligibleParentOptionDto {
  @ApiProperty({ description: 'Root appointment ID', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Scheduled date of the root appointment',
    example: '2025-07-22',
    format: 'YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({
    description: 'Main concern from the root consultation',
    example: 'Back pain',
  })
  main_concern: string;

  @ApiProperty({
    description: 'Display label (date + main concern)',
    example: '2025-07-22 - Back pain',
  })
  label: string;
}

// Response for GET /appointments/eligible-parent-options
export class EligibleParentOptionsResponseDto {
  @ApiProperty({
    description: 'List of eligible parent (root) appointments for linking a new consultation',
    type: [EligibleParentOptionDto],
  })
  options: EligibleParentOptionDto[];
}

// DTO for bulk cancelling appointments
export class BulkCancelAppointmentsDto {
  @ApiProperty({
    description: 'Array of appointment IDs to cancel',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  appointment_ids: number[];

  @ApiPropertyOptional({
    description: 'Cancellation reason for all appointments',
    example: 'Patient requested cancellation',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  cancellation_reason?: string;
}

// DTO for bulk postponing appointments (reschedule to a specific date)
export class BulkPostponeAppointmentsDto {
  @ApiProperty({
    description: 'Array of appointment IDs to postpone',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  appointment_ids: number[];

  @ApiProperty({
    description: 'New scheduled date in YYYY-MM-DD format',
    example: '2026-02-12',
    format: 'date',
  })
  @IsDateString()
  @IsNotEmpty()
  new_date: string;

  @ApiPropertyOptional({
    description:
      'When true, auto-reschedules linked return assessment appointments for postponed treatments (next-available mode only).',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  reschedule_return_assessment?: boolean;
}

// DTO for next-available-date preview request
export class NextAvailableDateRequestDto {
  @ApiProperty({
    description: 'Array of appointment IDs to get next available date for',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  appointment_ids: number[];
}

// DTO for next-available-date preview response (map appointment_id -> date or null)
export class NextAvailableDateResponseDto {
  @ApiProperty({
    description:
      'Map of appointment ID to next available date (YYYY-MM-DD) or null if none in 52 weeks',
    example: { '1': '2026-03-24', '2': '2026-04-07', '3': null },
  })
  dates: Record<number, string | null>;
}

// DTO for rescheduling cancelled or missed appointments
export class RescheduleAppointmentsDto {
  @ApiProperty({
    description: 'IDs of cancelled or missed appointments to reschedule (e.g. all in a group: physiotherapy + tens)',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  appointment_ids: number[];

  @ApiProperty({
    description: 'New scheduled date in YYYY-MM-DD format',
    example: '2026-03-03',
    format: 'YYYY-MM-DD',
  })
  @IsDateString()
  @IsNotEmpty()
  new_scheduled_date: string;
}

// DTO for recomputing the return consultation date after treatment sessions are postponed
export class RecomputeReturnForEpisodeDto {
  @ApiProperty({
    description: 'ID of any treatment appointment (physiotherapy or tens) in the episode',
    example: 42,
  })
  @IsNumber()
  @IsNotEmpty()
  appointment_id: number;
}

// Response DTO for recompute-return endpoint
export class RecomputeReturnResultDto {
  @ApiProperty({
    description: 'Whether the return consultation was rescheduled',
    example: true,
  })
  rescheduled: boolean;

  @ApiPropertyOptional({ description: 'Return appointment ID', example: 99 })
  appointment_id?: number;

  @ApiPropertyOptional({ description: 'Patient ID', example: 10 })
  patient_id?: number;

  @ApiPropertyOptional({ description: 'Patient name', example: 'Emily' })
  patient_name?: string;

  @ApiPropertyOptional({ description: 'Previous scheduled date', example: '2026-06-24' })
  old_date?: string;

  @ApiPropertyOptional({ description: 'New scheduled date', example: '2026-07-01' })
  new_date?: string;
}

// DTO for bulk operation response
export class BulkOperationResultDto {
  @ApiProperty({
    description: 'Number of successfully processed appointments',
    example: 2,
  })
  success_count: number;

  @ApiProperty({
    description: 'Number of failed appointments',
    example: 1,
  })
  failure_count: number;

  @ApiProperty({
    description: 'Details of successful operations',
    example: [
      { appointment_id: 1, message: 'Successfully cancelled' },
      { appointment_id: 2, message: 'Successfully cancelled' },
    ],
  })
  successes: Array<{ appointment_id: number; message: string }>;

  @ApiProperty({
    description: 'Details of failed operations',
    example: [
      { appointment_id: 3, error: 'Appointment not found' },
    ],
  })
  failures: Array<{ appointment_id: number; error: string }>;

  @ApiPropertyOptional({
    description: 'Auto-rescheduled assessment return appointments summary',
    example: [
      {
        appointment_id: 55,
        patient_id: 10,
        patient_name: 'Emily',
        old_date: '2026-04-01',
        new_date: '2026-04-08',
      },
    ],
  })
  auto_rescheduled_returns?: Array<{
    appointment_id: number;
    patient_id: number;
    patient_name: string;
    old_date: string;
    new_date: string;
  }>;

  @ApiPropertyOptional({
    description:
      'Return assessment appointments that could not be auto-rescheduled (manual action required)',
    example: [{ appointment_id: 66, error: 'Date blocked by holiday' }],
  })
  failed_return_reschedules?: Array<{ appointment_id: number; error: string }>;
}
