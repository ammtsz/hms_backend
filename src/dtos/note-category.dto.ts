import { IsString, IsOptional, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Sanitize } from '../common/decorators/sanitize.decorator';

export class CreateNoteCategoryDto {
  @ApiProperty({
    description:
      'Stored category code (e.g., "geral", "alteracao_de_status", "medicamentos", "progresso", "emergencia")',
    example: 'alteracao_de_status',
  })
  @IsString()
  @MaxLength(50, { message: 'Código deve ter no máximo 50 caracteres' })
  @Matches(/^[a-z0-9_-]+$/, {
    message:
      'Código inválido. Use apenas letras minúsculas (a-z), números (0-9), _ ou -',
  })
  value: string;

  @ApiProperty({
    description: 'Human readable label for UI',
    example: 'Mudança de status',
  })
  @Sanitize()
  @IsString()
  @MaxLength(50, { message: 'Rótulo deve ter no máximo 50 caracteres' })
  label: string;

  @ApiProperty({
    description: 'Optional ordering hint',
    example: 3,
  })
  @IsOptional()
  sort_order?: number;
}

