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
import { AttendanceType, AttendanceStatus } from '../common/enums';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { PatientResponseDto } from './patient.dto';

export class CreateAttendanceDto {
  @ApiProperty({ description: 'Patient ID', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  patient_id: number;

  @ApiProperty({
    description: 'Type of attendance',
    enum: AttendanceType,
    example: AttendanceType.ASSESSMENT,
  })
  @IsEnum(AttendanceType)
  @IsNotEmpty()
  type: AttendanceType;

  @ApiProperty({
    description: 'Date of attendance',
    example: '2025-07-22',
    format: 'YYYY-MM-DD',
  })
  @IsDateString()
  @IsNotEmpty()
  scheduled_date: string;

  @ApiProperty({
    description: 'Time of attendance',
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
      'Parent attendance ID for linking follow-ups and generated treatments to original consultation',
    example: 123,
  })
  @IsNumber()
  @IsOptional()
  parent_attendance_id?: number;

  @ApiPropertyOptional({
    description: 'Initial status for the attendance (optional, defaults to scheduled)',
    enum: AttendanceStatus,
    example: AttendanceStatus.SCHEDULED,
  })
  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;
}

export class UpdateAttendanceDto {
  @ApiPropertyOptional({
    description: 'Updated type of attendance',
    enum: AttendanceType,
    example: AttendanceType.ASSESSMENT,
  })
  @IsEnum(AttendanceType)
  @IsOptional()
  type?: AttendanceType;

  @ApiPropertyOptional({
    description: 'Status of attendance',
    enum: AttendanceStatus,
    example: AttendanceStatus.IN_PROGRESS,
  })
  @IsEnum(AttendanceStatus)
  @IsOptional()
  status?: AttendanceStatus;

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
      'Parent attendance ID for linking follow-ups and generated treatments',
    example: 123,
  })
  @IsNumber()
  @IsOptional()
  parent_attendance_id?: number;
}

export class AttendanceResponseDto {
  @ApiProperty({ description: 'Attendance ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Patient ID', example: 1 })
  patient_id: number;

  @ApiProperty({
    description: 'Type of attendance',
    enum: AttendanceType,
    example: AttendanceType.ASSESSMENT,
  })
  type: AttendanceType;

  @ApiProperty({
    description: 'Status of attendance',
    enum: AttendanceStatus,
    example: AttendanceStatus.SCHEDULED,
  })
  status: AttendanceStatus;

  @ApiProperty({
    description: 'Date of attendance',
    example: '2025-08-06',
    format: 'YYYY-MM-DD',
  })
  scheduled_date: string;

  @ApiProperty({
    description: 'Time of attendance',
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
      'Parent attendance ID for linked follow-ups and generated treatments',
    example: 123,
  })
  parent_attendance_id?: number;

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

// Simplified DTO for agenda view - contains only essential information
export class AttendanceAgendaDto {
  @ApiProperty({ description: 'Attendance ID', example: 1 })
  id: number;

  @ApiProperty({ description: 'Patient ID', example: 1 })
  patient_id: number;

  @ApiProperty({
    description: 'Type of attendance',
    enum: AttendanceType,
    example: AttendanceType.ASSESSMENT,
  })
  type: AttendanceType;

  @ApiProperty({
    description: 'Status of attendance',
    enum: AttendanceStatus,
    example: AttendanceStatus.SCHEDULED,
  })
  status: AttendanceStatus;

  @ApiProperty({
    description: 'Date of attendance',
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
    example: 'João Silva',
  })
  patient_name: string;

  @ApiProperty({
    description: 'Patient priority',
    example: 'NORMAL',
  })
  patient_priority: string;
}

// DTO for next scheduled attendance date
export class NextAttendanceDateDto {
  @ApiProperty({
    description: 'Next scheduled attendance date',
    example: '2025-07-30',
    format: 'YYYY-MM-DD',
  })
  next_date: string;
}

// DTO for one eligible parent attendance option (ongoing treatment root)
export class EligibleParentOptionDto {
  @ApiProperty({ description: 'Root attendance ID', example: 1 })
  id: number;

  @ApiProperty({
    description: 'Scheduled date of the root attendance',
    example: '2025-07-22',
    format: 'YYYY-MM-DD',
  })
  date: string;

  @ApiProperty({
    description: 'Main complaint from the root consultation',
    example: 'Dor nas costas',
  })
  main_complaint: string;

  @ApiProperty({
    description: 'Display label (date + main complaint)',
    example: '2025-07-22 - Dor nas costas',
  })
  label: string;
}

// Response for GET /attendances/eligible-parent-options
export class EligibleParentOptionsResponseDto {
  @ApiProperty({
    description: 'List of eligible parent (root) attendances for linking a new consultation',
    type: [EligibleParentOptionDto],
  })
  options: EligibleParentOptionDto[];
}

// DTO for bulk cancelling attendances
export class BulkCancelAttendancesDto {
  @ApiProperty({
    description: 'Array of attendance IDs to cancel',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  attendance_ids: number[];

  @ApiPropertyOptional({
    description: 'Cancellation reason for all attendances',
    example: 'Patient requested cancellation',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  cancellation_reason?: string;
}

// DTO for bulk postponing attendances (reschedule to a specific date)
export class BulkPostponeAttendancesDto {
  @ApiProperty({
    description: 'Array of attendance IDs to postpone',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  attendance_ids: number[];

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
      'When true, auto-reschedules linked return assessment attendances for postponed treatments (next-available mode only).',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  reschedule_return_assessment?: boolean;
}

// DTO for next-available-date preview request
export class NextAvailableDateRequestDto {
  @ApiProperty({
    description: 'Array of attendance IDs to get next available date for',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  attendance_ids: number[];
}

// DTO for next-available-date preview response (map attendance_id -> date or null)
export class NextAvailableDateResponseDto {
  @ApiProperty({
    description:
      'Map of attendance ID to next available date (YYYY-MM-DD) or null if none in 52 weeks',
    example: { '1': '2026-03-24', '2': '2026-04-07', '3': null },
  })
  dates: Record<number, string | null>;
}

// DTO for rescheduling cancelled or missed attendances
export class RescheduleAttendancesDto {
  @ApiProperty({
    description: 'IDs of cancelled or missed attendances to reschedule (e.g. all in a group: physiotherapy + tens)',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsNumber({}, { each: true })
  @IsNotEmpty()
  attendance_ids: number[];

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
    description: 'ID of any treatment attendance (physiotherapy or tens) in the episode',
    example: 42,
  })
  @IsNumber()
  @IsNotEmpty()
  attendance_id: number;
}

// Response DTO for recompute-return endpoint
export class RecomputeReturnResultDto {
  @ApiProperty({
    description: 'Whether the return consultation was rescheduled',
    example: true,
  })
  rescheduled: boolean;

  @ApiPropertyOptional({ description: 'Return attendance ID', example: 99 })
  attendance_id?: number;

  @ApiPropertyOptional({ description: 'Patient ID', example: 10 })
  patient_id?: number;

  @ApiPropertyOptional({ description: 'Patient name', example: 'Maria' })
  patient_name?: string;

  @ApiPropertyOptional({ description: 'Previous scheduled date', example: '2026-06-24' })
  old_date?: string;

  @ApiPropertyOptional({ description: 'New scheduled date', example: '2026-07-01' })
  new_date?: string;
}

// DTO for bulk operation response
export class BulkOperationResultDto {
  @ApiProperty({
    description: 'Number of successfully processed attendances',
    example: 2,
  })
  success_count: number;

  @ApiProperty({
    description: 'Number of failed attendances',
    example: 1,
  })
  failure_count: number;

  @ApiProperty({
    description: 'Details of successful operations',
    example: [
      { attendance_id: 1, message: 'Successfully cancelled' },
      { attendance_id: 2, message: 'Successfully cancelled' },
    ],
  })
  successes: Array<{ attendance_id: number; message: string }>;

  @ApiProperty({
    description: 'Details of failed operations',
    example: [
      { attendance_id: 3, error: 'Attendance not found' },
    ],
  })
  failures: Array<{ attendance_id: number; error: string }>;

  @ApiPropertyOptional({
    description: 'Auto-rescheduled assessment return attendances summary',
    example: [
      {
        attendance_id: 55,
        patient_id: 10,
        patient_name: 'Maria',
        old_date: '2026-04-01',
        new_date: '2026-04-08',
      },
    ],
  })
  auto_rescheduled_returns?: Array<{
    attendance_id: number;
    patient_id: number;
    patient_name: string;
    old_date: string;
    new_date: string;
  }>;

  @ApiPropertyOptional({
    description:
      'Return assessment attendances that could not be auto-rescheduled (manual action required)',
    example: [{ attendance_id: 66, error: 'Date blocked by holiday' }],
  })
  failed_return_reschedules?: Array<{ attendance_id: number; error: string }>;
}
