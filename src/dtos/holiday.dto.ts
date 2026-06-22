import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';

export class CreateHolidayDto {
  @ApiProperty({
    example: '2026-12-25',
    description: 'Holiday date (YYYY-MM-DD)',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'holiday_date must be in YYYY-MM-DD format',
  })
  holiday_date: string;

  @ApiProperty({ example: 'Christmas', description: 'Holiday name' })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'National Holiday', required: false })
  @Sanitize()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: ['assessment', 'physiotherapy'],
    required: false,
    description: 'Treatment types to block (null = all types)',
  })
  @IsArray()
  @IsOptional()
  @IsEnum(['assessment', 'physiotherapy', 'tens'], { each: true })
  blocked_treatment_types?: string[] | null;

  @ApiProperty({
    example: 'a0b1c2d3-e4f5-6789-abcd-ef0123456789',
    required: false,
    description: 'UUID to group multiple holidays as a period. Generated automatically for bulk period creation.',
  })
  @IsString()
  @IsOptional()
  holiday_group_id?: string | null;
}

export class UpdateHolidayDto {
  @ApiProperty({ required: false })
  @Sanitize()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ required: false })
  @Sanitize()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ required: false })
  @IsArray()
  @IsOptional()
  blocked_treatment_types?: string[] | null;
}

export class HolidayResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  holiday_date: string; // ISO date string

  @ApiProperty()
  name: string;

  @ApiProperty()
  description?: string;

  @ApiProperty()
  blocked_treatment_types?: string[] | null;
  @ApiProperty({ required: false })
  holiday_group_id: string | null;
  @ApiProperty()
  created_date: string;

  @ApiProperty()
  updated_date: string;
}

export class HolidayConflictDto {
  @ApiProperty()
  hasConflict: boolean;

  @ApiProperty()
  attendanceCount: number;

  @ApiProperty({ type: [Object] })
  attendances?: Array<{
    id: number;
    patient_name: string;
    treatment_type: string;
  }>;
}

export class BulkCreateHolidayDto {
  @ApiProperty({ type: [CreateHolidayDto] })
  @IsArray()
  holidays: CreateHolidayDto[];
}

export class BulkCreateHolidayResultDto {
  @ApiProperty()
  successCount: number;

  @ApiProperty()
  failureCount: number;

  @ApiProperty({ type: [Object] })
  errors: Array<{
    holiday: CreateHolidayDto;
    error: string;
  }>;
}

export class CreateHolidayPeriodDto {
  @ApiProperty({
    example: '2026-01-01',
    description: 'Period start date (YYYY-MM-DD)',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'start_date must be in YYYY-MM-DD format',
  })
  start_date: string;

  @ApiProperty({
    example: '2026-01-03',
    description: 'Period end date (YYYY-MM-DD)',
  })
  @IsNotEmpty()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'end_date must be in YYYY-MM-DD format',
  })
  end_date: string;

  @ApiProperty({ example: 'New Year Period', description: 'Holiday name for all dates in period' })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'New Year celebration period', required: false })
  @Sanitize()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: ['assessment', 'physiotherapy'],
    required: false,
    description: 'Treatment types to block (null = all types)',
  })
  @IsArray()
  @IsOptional()
  @IsEnum(['assessment', 'physiotherapy', 'tens'], { each: true })
  blocked_treatment_types?: string[] | null;
}
