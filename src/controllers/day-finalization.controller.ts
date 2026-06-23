import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DayFinalizationService } from '../services/day-finalization.service';
import { EndOfDayProcessService } from '../services/end-of-day-process.service';
import { DayFinalization } from '../entities/day-finalization.entity';
import {
  ProcessEndOfDayRequestDto,
  type ProcessEndOfDayResponseDto,
} from '../dtos/process-end-of-day.dto';

/**
 * DayFinalizationController
 * Handles HTTP requests for day finalization operations
 */
@ApiTags('Day Finalization')
@UseGuards(JwtAuthGuard)
@Controller('day-finalization')
export class DayFinalizationController {
  private readonly logger = new Logger(DayFinalizationController.name);

  constructor(
    private readonly finalizationService: DayFinalizationService,
    private readonly endOfDayProcessService: EndOfDayProcessService,
  ) {}

  /**
   * Process end-of-day: mark absences, reschedule or F+cancel, finalize.
   * POST /day-finalization/process
   */
  @Post('process')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Process end-of-day with absence justifications' })
  @ApiBody({
    description: 'Date and absence justifications',
    schema: {
      type: 'object',
      required: ['date', 'absence_justifications'],
      properties: {
        date: {
          type: 'string',
          format: 'date',
          description: 'Date to process (YYYY-MM-DD)',
          example: '2026-01-15',
        },
        absence_justifications: {
          type: 'array',
          items: {
            type: 'object',
            required: ['appointment_id', 'justified'],
            properties: {
              appointment_id: { type: 'number', example: 1 },
              justified: { type: 'boolean', example: false },
              notes: { type: 'string', example: 'Optional notes' },
            },
          },
        },
      },
    },
  })
  async processEndOfDay(
    @Body() body: ProcessEndOfDayRequestDto,
  ): Promise<ProcessEndOfDayResponseDto> {
    this.logger.log(`Processing end-of-day for date: ${body.date}`);

    const result = await this.endOfDayProcessService.processEndOfDay(body);

    this.logger.log(
      `Successfully processed end-of-day: ${result.rescheduled.length} rescheduled, ` +
        `${result.status_changed_to_c.length} status C, ${result.cancelled_for_c.length} cancelled`,
    );

    return result;
  }

  /**
   * Check if a specific date is finalized
   * GET /day-finalization/:date/status
   */
  @Get(':date/status')
  @ApiOperation({ summary: 'Check if a specific date is finalized' })
  @ApiParam({
    name: 'date',
    description: 'Date to check (YYYY-MM-DD format)',
    example: '2026-01-15',
  })
  async getDayFinalizationStatus(
    @Param('date') date: string,
  ): Promise<{ isFinalized: boolean; finalization?: DayFinalization }> {
    this.logger.log(`Checking finalization status for date: ${date}`);

    const finalization =
      await this.finalizationService.getFinalizationStatus(date);

    return {
      isFinalized: !!finalization,
      finalization: finalization || undefined,
    };
  }
}
