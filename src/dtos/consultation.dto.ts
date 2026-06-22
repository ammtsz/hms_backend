import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  IsNotEmpty,
  IsIn,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { Consultation } from '../entities/consultation.entity';

export class CreateConsultationDto {
  @ApiProperty({
    description: 'ID of the related attendance',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  attendance_id: number;

  @ApiPropertyOptional({
    description: 'Main concern from the patient',
    example: 'Pain in lower back',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  main_concern?: string;

  @ApiPropertyOptional({
    description:
      'Treatment status (stored on consultation and used for patient update)',
    example: 'T',
    enum: ['N', 'T', 'A', 'F'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['N', 'T', 'A', 'F'])
  patient_status?: string;

  @ApiPropertyOptional({
    description: 'Food recommendations',
    example: 'Avoid dairy products',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  food?: string;

  @ApiPropertyOptional({
    description: 'Water recommendations',
    example: 'Drink 2L of fluidized water daily',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  water?: string;

  @ApiPropertyOptional({
    description: 'Ointment recommendations',
    example: 'Apply chamomile ointment before bed',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  ointments?: string;

  @ApiPropertyOptional({
    description: 'Whether physiotherapy treatment was given',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  physiotherapy?: boolean;

  @ApiPropertyOptional({
    description: 'Whether tens treatment was given',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  tens?: boolean;

  @ApiPropertyOptional({
    description: 'Number of weeks until next appointment',
    minimum: 0,
    maximum: 52,
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(52)
  return_weeks?: number;

  @ApiPropertyOptional({
    description: 'Additional treatment notes',
    example: 'Patient showed improvement in energy levels',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Time when consultation started (attendance moved to in_progress)',
    example: '19:35:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  start_time?: string;

  @ApiPropertyOptional({
    description:
      'Time when consultation completed (consultation submitted)',
    example: '20:00:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Whether to schedule return when treatment is complete',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  return_when_treatment_complete?: boolean;
}

export class UpdateConsultationDto {
  @ApiPropertyOptional({
    description: 'ID of the related attendance',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  attendance_id?: number;

  @ApiPropertyOptional({
    description: 'Main concern from the patient',
    example: 'Pain in lower back',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  main_concern?: string;

  @ApiPropertyOptional({
    description:
      'Treatment status for patient update (not stored on consultation row)',
    example: 'T',
    enum: ['N', 'T', 'A', 'F'],
  })
  @IsString()
  @IsOptional()
  patient_status?: string;

  @ApiPropertyOptional({
    description: 'Food recommendations',
    example: 'Avoid dairy products',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  food?: string;

  @ApiPropertyOptional({
    description: 'Water recommendations',
    example: 'Drink 2L of fluidized water daily',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  water?: string;

  @ApiPropertyOptional({
    description: 'Ointment recommendations',
    example: 'Apply chamomile ointment before bed',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  ointments?: string;

  @ApiPropertyOptional({
    description: 'Whether physiotherapy treatment was given',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  physiotherapy?: boolean;

  @ApiPropertyOptional({
    description: 'Whether tens treatment was given',
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  tens?: boolean;

  @ApiPropertyOptional({
    description: 'Number of weeks until next appointment',
    minimum: 0,
    maximum: 52,
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(52)
  return_weeks?: number;

  @ApiPropertyOptional({
    description: 'Additional treatment notes',
    example: 'Patient showed improvement in energy levels',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Time when consultation started (attendance moved to in_progress)',
    example: '19:35:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  start_time?: string;

  @ApiPropertyOptional({
    description:
      'Time when consultation completed (consultation submitted)',
    example: '20:00:00',
    pattern: 'HH:mm:ss',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm:ss',
  })
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Whether to schedule return when treatment is complete',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  return_when_treatment_complete?: boolean;
}

export class ConsultationResponseDto {
  @ApiProperty({
    description: 'Consultation ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'ID of the related attendance',
    example: 1,
  })
  attendance_id: number;

  @ApiPropertyOptional({
    description: 'Main concern from the patient',
    example: 'Pain in lower back',
  })
  main_concern?: string;

  @ApiPropertyOptional({
    description: 'Treatment status (N, T, A, or F)',
    example: 'T',
    enum: ['N', 'T', 'A', 'F'],
  })
  patient_status?: string;

  @ApiPropertyOptional({
    description: 'Food recommendations',
    example: 'Avoid dairy products',
  })
  food?: string;

  @ApiPropertyOptional({
    description: 'Water recommendations',
    example: 'Drink 2L of fluidized water daily',
  })
  water?: string;

  @ApiPropertyOptional({
    description: 'Ointment recommendations',
    example: 'Apply chamomile ointment before bed',
  })
  ointments?: string;

  @ApiPropertyOptional({
    description: 'Whether physiotherapy treatment was given',
    example: true,
  })
  physiotherapy?: boolean;

  @ApiPropertyOptional({
    description: 'Whether tens treatment was given',
    example: false,
  })
  tens?: boolean;

  @ApiPropertyOptional({
    description: 'Number of weeks until next appointment',
    example: 2,
  })
  return_weeks?: number;

  @ApiPropertyOptional({
    description: 'Whether to schedule return when treatment is complete',
    example: true,
  })
  return_when_treatment_complete?: boolean;

  @ApiPropertyOptional({
    description: 'Additional treatment notes',
    example: 'Patient showed improvement in energy levels',
  })
  notes?: string;

  @ApiPropertyOptional({
    description: 'Time when consultation started',
    example: '19:35:00',
  })
  start_time?: string;

  @ApiPropertyOptional({
    description: 'Time when consultation completed',
    example: '20:00:00',
  })
  end_time?: string;

  @ApiProperty({
    description: 'Creation date',
    example: '2025-07-22',
  })
  created_date: string;

  @ApiProperty({
    description: 'Creation time',
    example: '10:00:00',
  })
  created_time: string;

  @ApiProperty({
    description: 'Last update date',
    example: '2025-07-22',
  })
  updated_date: string;

  @ApiProperty({
    description: 'Last update time',
    example: '10:00:00',
  })
  updated_time: string;
}

export class TreatmentResult {
  @ApiProperty({
    description: 'Whether the treatment plan row and its sessions were created successfully',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'List of errors encountered during session creation',
    example: [
      'Failed to create attendance: Patient already has appointment at this time',
    ],
    type: [String],
  })
  errors: string[];
}

export class TreatmentsResult {
  @ApiPropertyOptional({
    description: 'Result of physiotherapy treatment creation',
    type: TreatmentResult,
  })
  physiotherapyResult?: TreatmentResult;

  @ApiPropertyOptional({
    description: 'Result of tens treatment creation',
    type: TreatmentResult,
  })
  tensResult?: TreatmentResult;
}

/**
 * Result type for consultation create/update when status is A or F.
 * Used by ConsultationService and mapped to UpdateConsultationResponseDto by the controller.
 */
export class ConsultationResult {
  consultation: Consultation;
  cancelledAttendances?: CancelledAttendanceItemDto[];
}

export class CancelledAttendanceItemDto {
  @ApiProperty({ description: 'Attendance ID' })
  id: number;

  @ApiProperty({ description: 'Attendance type (assessment, physiotherapy, tens)' })
  type: string;

  @ApiProperty({ description: 'Scheduled date (YYYY-MM-DD)' })
  scheduled_date: string;
}

export class UpdateConsultationResponseDto {
  @ApiProperty({
    description: 'The updated consultation',
    type: ConsultationResponseDto,
  })
  consultation: ConsultationResponseDto;

  @ApiPropertyOptional({
    description: 'Results of any treatments created during the update',
    type: TreatmentsResult,
  })
  treatments?: TreatmentsResult;

  @ApiPropertyOptional({
    description:
      'Attendances cancelled when treatment status was set to Discharged (A) or Missed (F)',
    type: [CancelledAttendanceItemDto],
  })
  cancelled_attendances?: CancelledAttendanceItemDto[];
}

export class ScheduleReturnDto {
  @ApiProperty({
    description:
      'Return scheduling mode: legacy schedules immediately; auto-return is deferred until sessions complete',
    enum: ['legacy', 'auto-return'],
    example: 'legacy',
  })
  @IsString()
  @IsNotEmpty()
  @IsIn(['legacy', 'auto-return'])
  mode: 'legacy' | 'auto-return';
}
