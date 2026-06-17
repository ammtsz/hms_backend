import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Sanitize } from '../common/decorators/sanitize.decorator';

/**
 * DTOs for the process end-of-day endpoint
 */

export class AbsenceJustificationItemDto {
  @IsInt()
  attendance_id: number;

  @IsBoolean()
  justified: boolean;

  @Sanitize()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ProcessEndOfDayRequestDto {
  @IsDateString()
  date: string; // YYYY-MM-DD

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AbsenceJustificationItemDto)
  absence_justifications: AbsenceJustificationItemDto[];
}

export interface RescheduledItemDto {
  attendance_id: number;
  patient_id: number;
  patient_name: string;
  type: string;
  old_date: string;
  new_date: string;
}

export interface StatusChangedToFItemDto {
  patient_id: number;
  patient_name: string;
}

export interface CancelledAttendanceDto {
  id: number;
  type: string;
  scheduled_date: string;
}

export interface CancelledForFItemDto {
  patient_id: number;
  patient_name: string;
  attendances: CancelledAttendanceDto[];
}

export interface CouldNotRescheduleItemDto {
  attendance_id: number;
  patient_id: number;
  patient_name: string;
  type: string;
  reason: string;
}

export interface ProcessEndOfDayResponseDto {
  rescheduled: RescheduledItemDto[];
  status_changed_to_f: StatusChangedToFItemDto[];
  cancelled_for_f: CancelledForFItemDto[];
  could_not_reschedule: CouldNotRescheduleItemDto[];
}
