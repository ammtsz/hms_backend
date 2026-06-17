import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  ArrayNotEmpty,
} from 'class-validator';
import { PatientPriority } from '../common/enums';

export class BulkUpdatePatientsPriorityDto {
  @ApiProperty({
    description: 'List of patient IDs to update',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  patient_ids: number[];

  @ApiProperty({
    description: 'Target priority level',
    enum: PatientPriority,
    example: PatientPriority.LEVEL_2,
  })
  @IsEnum(PatientPriority)
  priority: PatientPriority;
}

