import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';

export type NoteCategory = string;

export class CreatePatientNoteDto {
  @ApiProperty({
    description: 'The content of the patient note',
    example:
      'Patient reported significant improvement in sleep quality after treatment.',
    maxLength: 2000,
  })
  @Sanitize()
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000, {
    message: 'Note content cannot exceed 2000 characters',
  })
  note_content: string;

  @ApiPropertyOptional({
    description: 'Category of the note',
    default: 'geral',
    example: 'treatment',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Category deve ter no máximo 50 caracteres' })
  category?: NoteCategory = 'geral';
}

export class UpdatePatientNoteDto {
  @ApiPropertyOptional({
    description: 'The content of the patient note',
    example:
      'Patient reported significant improvement in sleep quality after treatment.',
    maxLength: 2000,
  })
  @Sanitize()
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  @MaxLength(2000, {
    message: 'Note content cannot exceed 2000 characters',
  })
  note_content?: string;

  @ApiPropertyOptional({
    description: 'Category of the note',
    example: 'treatment',
  })
  @IsString()
  @IsOptional()
  @MaxLength(50, { message: 'Category deve ter no máximo 50 caracteres' })
  category?: NoteCategory;
}

export class PatientNoteResponseDto {
  @ApiProperty({
    description: 'Unique identifier for the note',
    example: 1,
  })
  id: number;

  @ApiProperty({
    description: 'ID of the patient this note belongs to',
    example: 123,
  })
  patient_id: number;

  @ApiProperty({
    description: 'The content of the patient note',
    example:
      'Patient reported significant improvement in sleep quality after treatment.',
  })
  note_content: string;

  @ApiProperty({
    description: 'Category of the note',
    example: 'treatment',
  })
  category: string;

  @ApiProperty({
    description: 'Date when the note was created',
    example: '2025-01-15',
  })
  created_date: string;

  @ApiProperty({
    description: 'Time when the note was created',
    example: '14:30:00',
  })
  created_time: string;

  @ApiProperty({
    description: 'Date when the note was last updated',
    example: '2025-01-15',
  })
  updated_date: string;

  @ApiProperty({
    description: 'Time when the note was last updated',
    example: '14:30:00',
  })
  updated_time: string;
}
