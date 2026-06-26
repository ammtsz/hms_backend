import {
  IsString,
  IsBoolean,
  IsEnum,
  MaxLength,
  IsOptional,
  IsInt,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';
import { SystemOptionType } from '../entities/system-option.entity';

/** Value-only payload for body-location create endpoints */
export class CreateSystemOptionValueDto {
  @Sanitize()
  @IsString()
  @MaxLength(50, { message: 'Name must be at most 50 characters long' })
  value: string;
}

export class CreateSystemOptionDto {
  @IsEnum(SystemOptionType)
  type: SystemOptionType;

  @Sanitize()
  @IsString()
  @MaxLength(50, { message: 'Name must be at most 50 characters long' })
  value: string;

  @ApiPropertyOptional({
    description: 'Human readable label for UI (optional; can be null)',
    example: 'Seniors/children',
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Label must be at most 50 characters long' })
  label?: string | null;

  @ApiPropertyOptional({
    description: 'Optional ordering value',
    example: 2,
  })
  @IsInt()
  @IsOptional()
  sort_order?: number;
}

export class UpdateSystemOptionDto {
  @Sanitize()
  @IsString()
  @MaxLength(50, { message: 'Name must be at most 50 characters long' })
  @IsOptional()
  value?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @Sanitize()
  @IsString()
  @MaxLength(50, { message: 'Label must be at most 50 characters long' })
  @IsOptional()
  label?: string | null;

  @IsInt()
  @IsOptional()
  sort_order?: number;
}

export class SystemOptionResponseDto {
  id: number;
  type: SystemOptionType;
  value: string;
  label?: string | null;
  sort_order?: number | null;
  is_active: boolean;
  usage_count?: number;
  created_at: Date;
  updated_at: Date;
}
