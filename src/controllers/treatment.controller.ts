import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  ValidationPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TreatmentService } from '../services/treatment.service';
import {
  CreateTreatmentDto,
  UpdateTreatmentDto,
  TreatmentResponseDto,
  BulkCreateTreatmentsDto,
  BulkCreateTreatmentsResponseDto,
} from '../dtos/treatment.dto';
import {
  ApiCreateTreatmentOperation,
  ApiGetTreatmentsByPatientOperation,
  ApiTreatmentOperation,
  ApiUpdateTreatmentOperation,
  ApiDeleteTreatmentOperation,
} from '../decorators/api-treatment.decorator';

@ApiTags('treatments')
@UseGuards(JwtAuthGuard)
@Controller('treatments')
export class TreatmentController {
  constructor(private readonly treatmentService: TreatmentService) {}

  @Post()
  @ApiCreateTreatmentOperation()
  async createTreatment(
    @Body(ValidationPipe) dto: CreateTreatmentDto,
  ): Promise<TreatmentResponseDto> {
    return this.treatmentService.createTreatment(dto);
  }

  @Post('bulk')
  @ApiTreatmentOperation('Bulk create treatments atomically')
  async bulkCreateTreatments(
    @Body(ValidationPipe) dto: BulkCreateTreatmentsDto,
  ): Promise<BulkCreateTreatmentsResponseDto> {
    const result = await this.treatmentService.bulkCreateTreatments(
      dto.treatments,
      dto.consultation_id,
      dto.auto_schedule_return || false,
      dto.physiotherapy_notes,
      dto.tens_notes,
    );

    return {
      created_treatments: result.createdTreatments,
      failed_treatments: result.failedTreatments,
      return_scheduled: result.returnScheduled,
      return_scheduling_error: result.returnSchedulingError,
    };
  }

  @Get('patient/:patientId')
  @ApiGetTreatmentsByPatientOperation()
  async getTreatmentsByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
  ): Promise<TreatmentResponseDto[]> {
    return this.treatmentService.getTreatmentsByPatient(patientId);
  }

  @Get(':id')
  @ApiTreatmentOperation('Get treatment by ID')
  async getTreatmentById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TreatmentResponseDto> {
    return this.treatmentService.getTreatmentById(id);
  }

  @Put(':id')
  @ApiUpdateTreatmentOperation()
  async updateTreatment(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: UpdateTreatmentDto,
  ): Promise<TreatmentResponseDto> {
    return this.treatmentService.updateTreatment(id, dto);
  }

  @Put(':id/cancel')
  @ApiTreatmentOperation('Cancel a treatment')
  async cancelTreatment(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<TreatmentResponseDto> {
    return this.treatmentService.cancelTreatment(id);
  }

  @Post('bulk-cancel')
  @ApiTreatmentOperation('Bulk cancel multiple treatments')
  async bulkCancelTreatments(
    @Body()
    dto: { treatment_ids: number[]; cancellation_reason?: string },
  ): Promise<{ cancelled_count: number; errors: string[] }> {
    return this.treatmentService.bulkCancelTreatments(
      dto.treatment_ids,
      dto.cancellation_reason,
    );
  }

  @Post('check-and-schedule-return/:consultationId')
  @ApiTreatmentOperation(
    'Check and schedule return consultation after treatments are created',
  )
  async checkAndScheduleReturnAfterSessions(
    @Param('consultationId', ParseIntPipe) consultationId: number,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.treatmentService.checkAndScheduleReturnAfterSessionsCreated(
        consultationId,
      );
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(
        `[TreatmentController] Failed to schedule return for consultation ${consultationId}:`,
        errorMessage,
      );
      return { success: false, error: errorMessage };
    }
  }

  @Delete(':id')
  @ApiDeleteTreatmentOperation()
  async deleteTreatment(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.treatmentService.deleteTreatment(id);
  }
}
