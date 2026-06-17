import {
  IsNumber,
  IsString,
  IsBoolean,
  IsOptional,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateScheduleSettingDto {
  @ApiProperty({
    description: 'Day of week (0 = Sunday, 6 = Saturday)',
    minimum: 0,
    maximum: 6,
    example: 1,
  })
  @IsNumber()
  @Min(0)
  @Max(6)
  day_of_week: number;

  @ApiProperty({
    description: 'Start time for the schedule',
    example: '09:00',
    pattern: 'HH:mm',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm',
  })
  start_time: string;

  @ApiProperty({
    description: 'End time for the schedule',
    example: '17:00',
    pattern: 'HH:mm',
  })
  @IsString()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm',
  })
  end_time: string;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent assessment consultations',
    minimum: 1,
    default: 1,
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  max_concurrent_assessment?: number = 1;

  @ApiPropertyOptional({
    description:
      'Maximum number of concurrent physiotherapy and tens treatments (shared room/doctor)',
    minimum: 1,
    default: 1,
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  max_concurrent_physiotherapy_tens?: number = 1;

  @ApiPropertyOptional({
    description: 'Whether the schedule is active',
    default: true,
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean = true;
}

export class UpdateScheduleSettingDto {
  @ApiPropertyOptional({
    description: 'Day of week (0 = Sunday, 6 = Saturday)',
    minimum: 0,
    maximum: 6,
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(6)
  day_of_week?: number;

  @ApiPropertyOptional({
    description: 'Start time for the schedule',
    example: '09:00',
    pattern: 'HH:mm',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm',
  })
  start_time?: string;

  @ApiPropertyOptional({
    description: 'End time for the schedule',
    example: '17:00',
    pattern: 'HH:mm',
  })
  @IsString()
  @IsOptional()
  @Matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Time must be in format HH:mm',
  })
  end_time?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of concurrent assessment consultations',
    minimum: 1,
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  max_concurrent_assessment?: number;

  @ApiPropertyOptional({
    description:
      'Maximum number of concurrent physiotherapy and tens treatments (shared room/doctor)',
    minimum: 1,
    example: 2,
  })
  @IsNumber()
  @IsOptional()
  @Min(1)
  max_concurrent_physiotherapy_tens?: number;

  @ApiPropertyOptional({
    description: 'Whether the schedule is active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}

export class ScheduleSettingResponseDto {
  @ApiProperty({
    description: 'Schedule setting ID',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'Day of week (0 = Sunday, 6 = Saturday)',
    example: 1,
  })
  day_of_week: number;

  @ApiProperty({
    description: 'Start time for the schedule',
    example: '09:00',
  })
  start_time: string;

  @ApiProperty({
    description: 'End time for the schedule',
    example: '17:00',
  })
  end_time: string;

  @ApiProperty({
    description: 'Maximum number of concurrent assessment consultations',
    example: 2,
  })
  max_concurrent_assessment: number;

  @ApiProperty({
    description:
      'Maximum number of concurrent physiotherapy and tens treatments (shared room/doctor)',
    example: 2,
  })
  max_concurrent_physiotherapy_tens: number;

  @ApiProperty({
    description: 'Whether the schedule is active',
    example: true,
  })
  is_active: boolean;

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
