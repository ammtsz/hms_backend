import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';

export class HolidayTemplateItemDto {
  @ApiProperty({ example: 12, description: 'Month (1-12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ example: 25, description: 'Day (1-31)' })
  @IsInt()
  @Min(1)
  @Max(31)
  day: number;

  @ApiProperty({ example: 'Christmas', description: 'Holiday name' })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'National Holiday', required: false })
  @Sanitize()
  @IsOptional()
  @IsString()
  description?: string;
}

export class CreateHolidayTemplateDto {
  @ApiProperty({
    example: 'Fixed Statutory Holidays',
    description: 'Template name',
  })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    example: 'Recurring federal holidays on the same calendar date every year.',
    required: false,
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    type: [HolidayTemplateItemDto],
    description: 'List of holidays in the template',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolidayTemplateItemDto)
  holidays: HolidayTemplateItemDto[];
}

export class UpdateHolidayTemplateDto {
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

  @ApiProperty({ type: [HolidayTemplateItemDto], required: false })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HolidayTemplateItemDto)
  @IsOptional()
  holidays?: HolidayTemplateItemDto[];
}

export class HolidayTemplateResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description?: string;

  @ApiProperty({ type: [HolidayTemplateItemDto] })
  holidays: HolidayTemplateItemDto[];

  @ApiProperty()
  created_date: string;
}

export class ApplyHolidayTemplateDto {
  @ApiProperty({ example: 2026, description: 'Year to apply template to' })
  @IsInt()
  @Min(2024)
  @Max(2100)
  year: number;
}

export class ApplyHolidayTemplateResultDto {
  @ApiProperty()
  successCount: number;

  @ApiProperty()
  failureCount: number;

  @ApiProperty({ type: [Object] })
  errors: Array<{
    date: string;
    name: string;
    error: string;
  }>;
}
