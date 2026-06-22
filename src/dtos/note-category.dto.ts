import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';

export class CreateNoteCategoryDto {
  @ApiProperty({
    description:
      'Stored category code (e.g., "general", "status_change", "medications", "progress", "emergency")',
    example: 'status_change',
  })
  @IsString()
  @MaxLength(50, { message: 'Code must be at most 50 characters long' })
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Invalid code. Use only lowercase letters (a-z), numbers (0-9), _ or -',
  })
  value: string;

  @ApiProperty({
    description: 'Human readable label for UI',
    example: 'Status change',
  })
  @Sanitize()
  @IsString()
  @MaxLength(50, { message: 'Label must be at most 50 characters long' })
  label: string;

  @ApiProperty({
    description: 'Optional ordering hint',
    example: 3,
  })
  @IsOptional()
  sort_order?: number;
}
