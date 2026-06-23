import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  Matches,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { PatientPriority, PatientStatus } from '../common/enums';
import { getClinicTimezone } from '../common/utils/timezone.utils';

export class CreatePatientDto {
  @ApiProperty({
    description: 'Patient full name',
    example: 'John Doe',
  })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Patient phone number',
    example: '(11) 99999-9999',
    pattern: '(XX) XXXXX-XXXX or (XX) XXXX-XXXX',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  @Matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, {
    message: 'Phone must be in format (XX) XXXXX-XXXX or (XX) XXXX-XXXX',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Patient priority level',
    enum: PatientPriority,
    default: PatientPriority.LEVEL_3,
    example: PatientPriority.LEVEL_3,
  })
  @IsEnum(PatientPriority)
  @IsOptional()
  priority?: PatientPriority = PatientPriority.LEVEL_3;

  @ApiPropertyOptional({
    description: 'Patient treatment status',
    enum: PatientStatus,
    default: PatientStatus.NEW_PATIENT,
    example: PatientStatus.NEW_PATIENT,
  })
  @IsEnum(PatientStatus)
  @IsOptional()
  patient_status?: PatientStatus = PatientStatus.NEW_PATIENT;

  @ApiPropertyOptional({
    description: 'Patient birth date',
    example: '1990-01-01',
  })
  @IsDateString()
  @IsOptional()
  birth_date?: string;

  @ApiPropertyOptional({
    description: 'Main health complaint',
    example: 'Frequent headaches',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  main_concern?: string;

  @ApiPropertyOptional({
    description: 'Patient timezone (IANA timezone format)',
    example: 'America/Sao_Paulo',
    default: 'America/Sao_Paulo',
  })
  @IsString()
  @IsOptional()
  timezone?: string = getClinicTimezone();
}

export class UpdatePatientDto {
  @ApiPropertyOptional({
    description: 'Patient full name',
    example: 'John Doe',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    description: 'Patient phone number',
    example: '(11) 99999-9999',
    pattern: '(XX) XXXXX-XXXX or (XX) XXXX-XXXX',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  @Matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, {
    message: 'Phone must be in format (XX) XXXXX-XXXX or (XX) XXXX-XXXX',
  })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Patient priority level',
    enum: PatientPriority,
    example: PatientPriority.LEVEL_3,
  })
  @IsEnum(PatientPriority)
  @IsOptional()
  priority?: PatientPriority;

  @ApiPropertyOptional({
    description: 'Patient treatment status',
    enum: PatientStatus,
    example: PatientStatus.IN_TREATMENT,
  })
  @IsEnum(PatientStatus)
  @IsOptional()
  patient_status?: PatientStatus;

  @ApiPropertyOptional({
    description: 'Cancellation reason used when setting patient status to D or C',
    example: 'Patient decided to cancel because they did not feel comfortable with future dates',
    maxLength: 2000,
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  @MaxLength(2000, {
    message: 'Cancellation reason cannot exceed 2000 characters',
  })
  cancellation_reason?: string;

  @ApiPropertyOptional({
    description: 'Patient birth date',
    example: '1990-01-01',
  })
  @IsDateString()
  @IsOptional()
  birth_date?: string;

  @ApiPropertyOptional({
    description: 'Main health complaint',
    example: 'Frequent headaches',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  main_concern?: string;

  @ApiPropertyOptional({
    description: 'Patient discharge date',
    example: '2025-12-31',
  })
  @IsDateString()
  @IsOptional()
  discharge_date?: string;

  @ApiPropertyOptional({
    description: 'Patient timezone (IANA timezone format)',
    example: 'America/Sao_Paulo',
  })
  @IsString()
  @IsOptional()
  timezone?: string;
}

export class PatientResponseDto {
  @ApiProperty({
    description: 'Patient unique identifier',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Patient full name',
    example: 'John Doe',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Patient phone number',
    example: '(11) 99999-9999',
  })
  phone?: string;

  @ApiProperty({
    description: 'Patient priority level',
    enum: PatientPriority,
    example: PatientPriority.LEVEL_3,
  })
  priority: PatientPriority;

  @ApiProperty({
    description: 'Patient treatment status',
    enum: PatientStatus,
    example: PatientStatus.IN_TREATMENT,
  })
  patient_status: PatientStatus;

  @ApiPropertyOptional({
    description: 'Patient birth date',
    example: '1990-01-01',
  })
  birth_date?: string;

  @ApiPropertyOptional({
    description: 'Main health complaint',
    example: 'Frequent headaches',
  })
  main_concern?: string;

  @ApiPropertyOptional({
    description: 'Patient discharge date',
    example: '2025-12-31',
  })
  discharge_date?: string;

  @ApiProperty({
    description: 'Treatment start date',
    example: '2025-07-22',
  })
  start_date: string;

  @ApiProperty({
    description: 'Number of consecutive missing appointments',
    example: 0,
  })
  missing_appointments_streak: number;

  @ApiProperty({
    description: 'Patient timezone (IANA timezone format)',
    example: 'America/Sao_Paulo',
  })
  timezone: string;

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
