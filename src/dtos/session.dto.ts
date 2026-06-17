import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsDateString,
} from 'class-validator';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { SessionAttendanceStatus } from '../entities/session.entity';
import { TreatmentPlanStatus } from '../entities/treatment.entity';

export class CreateSessionDto {
  @IsNumber()
  @IsNotEmpty()
  treatment_id: number;

  @IsNumber()
  @IsOptional()
  attendance_id?: number;

  @IsNumber()
  @IsNotEmpty()
  session_number: number;

  @IsDateString()
  @IsNotEmpty()
  scheduled_date: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  performed_by?: string;
}

export class UpdateSessionDto {
  @IsDateString()
  @IsOptional()
  start_time?: string;

  @IsDateString()
  @IsOptional()
  end_time?: string;

  @IsEnum(SessionAttendanceStatus)
  @IsOptional()
  status?: SessionAttendanceStatus;

  @Sanitize()
  @IsString()
  @IsOptional()
  notes?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  missed_reason?: string;

  @Sanitize()
  @IsString()
  @IsOptional()
  performed_by?: string;

  @IsNumber()
  @IsOptional()
  attendance_id?: number;
}

/** One `hms_session` row, optionally hydrated with parent `hms_treatment` fields. */
export class SessionResponseDto {
  id: number;
  treatment_id: number;
  attendance_id?: number;
  session_number: number;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  status: SessionAttendanceStatus;
  notes?: string;
  missed_reason?: string;
  performed_by?: string;
  created_date: string;
  created_time: string;
  updated_date: string;
  updated_time: string;
  treatment_type?: string;
  body_location?: string;
  planned_sessions?: number;
  completed_sessions?: number;
  duration_minutes?: number;
  color?: string;
  /** Notes on the parent treatment plan (`hms_treatment.notes`), not this session row. */
  treatment_notes?: string;
  cancellation_reason?: string;
  /** Workflow status of the parent treatment (`hms_treatment.status`). */
  treatment_status?: TreatmentPlanStatus;
}
