import { IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AppointmentsThresholdResponseDto {
  @ApiProperty({
    description: 'Number of unjustified consecutive absences that trigger status F',
    minimum: 1,
    maximum: 10,
    example: 3,
  })
  missing_appointments_threshold: number;
}

export class UpdateAppointmentsThresholdDto {
  @ApiProperty({
    description: 'Number of unjustified consecutive absences that trigger status F',
    minimum: 1,
    maximum: 10,
    example: 3,
  })
  @IsNumber()
  @Min(1)
  @Max(10)
  missing_appointments_threshold: number;
}
