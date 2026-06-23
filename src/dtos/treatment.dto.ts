import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
  Min,
  Max,
  ValidateIf,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { TreatmentType } from '../entities/treatment.entity';
import type { SessionResponseDto } from './session.dto';

/** Payload to create one `hms_treatment` row (modality + schedule). */
export class CreateTreatmentDto {
  @IsNumber()
  @IsNotEmpty()
  consultation_id: number;

  @IsNumber()
  @IsNotEmpty()
  appointment_id: number;

  @IsNumber()
  @IsNotEmpty()
  patient_id: number;

  @IsEnum(TreatmentType)
  @IsNotEmpty()
  treatment_type: TreatmentType;

  @Sanitize()
  @IsString()
  @IsNotEmpty()
  body_location: string;

  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @IsNumber()
  @Min(1)
  @Max(50)
  planned_sessions: number;

  @IsDateString()
  @IsOptional()
  end_date?: string;

  @ValidateIf((o) => o.treatment_type === TreatmentType.PHYSIOTHERAPY)
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Max(10)
  duration_minutes?: number;

  @ValidateIf((o) => o.treatment_type === TreatmentType.PHYSIOTHERAPY)
  @IsNotEmpty()
  @IsString()
  color?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  /**
   * When true, the first generated `hms_session` row reuses an existing appointment
   * instead of creating a new scheduled appointment for the start date.
   */
  @IsBoolean()
  @IsOptional()
  reuse_appointment_for_first_session?: boolean;

  /**
   * Appointment ID for the first session row when `reuse_appointment_for_first_session` is true
   * (the session’s appointment, not the prescription appointment on `Treatment`).
   */
  @IsNumber()
  @IsOptional()
  first_session_appointment_id?: number;
}

export class UpdateTreatmentDto {
  @IsNumber()
  @Min(0)
  @Max(50)
  @IsOptional()
  completed_sessions?: number;

  @IsDateString()
  @IsOptional()
  end_date?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  body_location?: string;

  @IsNumber()
  @Min(1)
  @Max(10)
  @IsOptional()
  duration_minutes?: number;

  @Sanitize()
  @IsString()
  @IsOptional()
  color?: string;
}

export class TreatmentResponseDto {
  id: number;
  consultation_id: number;
  appointment_id: number;
  patient_id: number;
  treatment_type: TreatmentType;
  body_location: string;
  start_date: string;
  planned_sessions: number;
  completed_sessions: number;
  end_date?: string;
  status: string;
  duration_minutes?: number;
  color?: string;
  notes?: string;
  cancellation_reason?: string;
  sessions?: SessionResponseDto[];
  created_date: string;
  created_time: string;
  updated_date: string;
  updated_time: string;
}

export class BulkCreateTreatmentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTreatmentDto)
  treatments: CreateTreatmentDto[];

  @IsNumber()
  @IsNotEmpty()
  consultation_id: number;

  @IsBoolean()
  @IsOptional()
  auto_schedule_return?: boolean;

  @Sanitize()
  @IsString()
  @IsOptional()
  physiotherapy_notes?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  tens_notes?: string;
}

export class BulkCreateTreatmentsResponseDto {
  created_treatments: TreatmentResponseDto[];
  failed_treatments: Array<{
    treatment: CreateTreatmentDto;
    error: string;
  }>;
  return_scheduled: boolean;
  return_scheduling_error?: string;
}
