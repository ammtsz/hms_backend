import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  Logger,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AttendanceType } from '../common/enums';
import { AttendanceService } from '../services/attendance.service';
import {
  CreateAttendanceDto,
  UpdateAttendanceDto,
  AttendanceResponseDto,
  AttendanceScheduleDto,
  NextAttendanceDateDto,
  BulkCancelAttendancesDto,
  BulkPostponeAttendancesDto,
  BulkOperationResultDto,
  RescheduleAttendancesDto,
  EligibleParentOptionsResponseDto,
  NextAvailableDateRequestDto,
  NextAvailableDateResponseDto,
  RecomputeReturnForEpisodeDto,
  RecomputeReturnResultDto,
} from '../dtos/attendance.dto';
import { AttendanceTransformer } from '../transformers/attendance.transformer';
import {
  ApiAttendanceOperation,
  ApiCreateAttendanceOperation,
  ApiUpdateAttendanceOperation,
} from '../decorators/api-attendance.decorator';
import { ResourceNotFoundException } from '../common/exceptions/base.exception';
import { AttendanceStatus } from '../common/enums';
import {
  parseScheduleDateRange,
  parseScheduleStatusQuery,
} from '../common/utils/schedule-query.utils';

@ApiTags('Attendances')
@UseGuards(JwtAuthGuard)
@Controller('attendances')
export class AttendanceController {
  private readonly logger = new Logger(AttendanceController.name);

  constructor(private readonly attendanceService: AttendanceService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateAttendanceOperation()
  @ApiBody({ type: CreateAttendanceDto })
  async create(
    @Body() createAttendanceDto: CreateAttendanceDto,
  ): Promise<AttendanceResponseDto> {
    this.logger.log(
      `Creating new attendance for patient ${createAttendanceDto.patient_id}`,
    );
    const attendance = await this.attendanceService.create(createAttendanceDto);
    this.logger.log(
      `Created attendance ${attendance.id} for patient ${attendance.patient_id}`,
    );
    return AttendanceTransformer.toResponseDto(attendance);
  }

  @Get()
  @ApiAttendanceOperation('Retrieve all attendances')
  @ApiQuery({
    name: 'patient_id',
    required: false,
    description: 'Filter by patient ID',
    type: 'number',
  })
  @ApiQuery({
    name: 'from_date',
    required: false,
    description: 'Filter attendances from this date onwards (YYYY-MM-DD)',
    type: 'string',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by attendance status',
    enum: [
      'scheduled',
      'checked_in',
      'in_progress',
      'completed',
      'cancelled',
      'missed',
    ],
  })
  async findAll(
    @Query('patient_id') patientId?: string,
    @Query('from_date') fromDate?: string,
    @Query('status') status?: string,
  ): Promise<AttendanceResponseDto[]> {
    this.logger.log('Retrieving attendances', { patientId, fromDate, status });

    if (patientId) {
      const attendances = await this.attendanceService.findByPatientId(
        +patientId,
        fromDate,
        status as AttendanceStatus,
      );
      this.logger.log(
        `Found ${attendances.length} attendances for patient ${patientId}`,
      );
      return attendances;
    }

    const attendances = await this.attendanceService.findAll();
    this.logger.log(`Found ${attendances.length} attendances`);
    return AttendanceTransformer.toResponseDtoList(attendances);
  }

  @Get('schedule')
  @ApiAttendanceOperation('Get all attendances for schedule view')
  @ApiQuery({
    name: 'status',
    required: false,
    isArray: true,
    description:
      'Filter by attendance status (repeat param: ?status=scheduled&status=checked_in). Omit or empty = all statuses.',
    enum: [
      'scheduled',
      'checked_in',
      'in_progress',
      'completed',
      'cancelled',
      'missed',
    ],
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by attendance type',
    enum: AttendanceType,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Limit the number of results',
    type: 'number',
  })
  @ApiQuery({
    name: 'from_date',
    required: false,
    description: 'Inclusive start of scheduled_date range (YYYY-MM-DD)',
    type: 'string',
  })
  @ApiQuery({
    name: 'to_date',
    required: false,
    description: 'Inclusive end of scheduled_date range (YYYY-MM-DD); max 90-day span enforced server-side',
    type: 'string',
  })
  async findAllForSchedule(
    @Query('status') statusQuery?: string | string[],
    @Query('type') type?: string,
    @Query('limit') limit?: string,
    @Query('from_date') fromDate?: string,
    @Query('to_date') toDate?: string,
  ): Promise<AttendanceScheduleDto[]> {
    const statuses = parseScheduleStatusQuery(statusQuery);
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit !== undefined &&
      Number.isFinite(parsedLimit) &&
      parsedLimit > 0
        ? parsedLimit
        : undefined;

    const range = parseScheduleDateRange(fromDate, toDate);

    this.logger.log('Fetching all attendances for schedule view', {
      statuses,
      type,
      limit: safeLimit,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });

    const rawData = await this.attendanceService.findAllForSchedule({
      statuses,
      type,
      limit: safeLimit,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });
    return AttendanceTransformer.toScheduleDtoList(rawData);
  }

  @Get('next-date')
  @ApiAttendanceOperation('Get next scheduled attendance date')
  async getNextScheduledDate(): Promise<NextAttendanceDateDto> {
    this.logger.log('Fetching next scheduled attendance date');
    try {
      const nextDate = await this.attendanceService.findNextScheduledDate();
      this.logger.log(`Next scheduled date found: ${nextDate || 'none'}`);
      return AttendanceTransformer.toNextDateDto(nextDate);
    } catch (error) {
      this.logger.error('Error fetching next scheduled date:', error);
      throw error;
    }
  }

  @Get('eligible-parent-options')
  @ApiAttendanceOperation(
    'Get eligible parent (root) attendances for linking a new assessment consultation. Excludes treatments finished with A or F.',
  )
  @ApiQuery({
    name: 'patient_id',
    required: true,
    description: 'Patient ID',
    type: 'number',
  })
  async getEligibleParentOptions(
    @Query('patient_id') patientId: string,
  ): Promise<EligibleParentOptionsResponseDto> {
    this.logger.log(
      `Fetching eligible parent options for patient ${patientId}`,
    );
    return this.attendanceService.findEligibleParentOptions(+patientId);
  }

  @Get('stats')
  @ApiAttendanceOperation('Get attendance statistics')
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date to get stats for (YYYY-MM-DD). Defaults to today.',
    type: 'string',
  })
  async getAttendanceStats(@Query('date') date?: string): Promise<{
    total: number;
    scheduled: number;
    checked_in: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    by_type: { assessment: number; physiotherapy: number; tens: number };
  }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    this.logger.log(`Fetching attendance statistics for date: ${targetDate}`);

    const stats = await this.attendanceService.getAttendanceStats(targetDate);
    return stats;
  }

  @Post('reschedule')
  @HttpCode(HttpStatus.CREATED)
  @ApiAttendanceOperation(
    'Reschedule cancelled or missed attendances to a new date. Creates new attendance(s) with same params; for physiotherapy/tens also clones or creates treatment session rows.',
  )
  @ApiBody({ type: RescheduleAttendancesDto })
  async reschedule(
    @Body() dto: RescheduleAttendancesDto,
  ): Promise<AttendanceResponseDto[]> {
    this.logger.log(
      `Rescheduling ${dto.attendance_ids.length} attendance(s) to ${dto.new_scheduled_date}`,
    );
    const created = await this.attendanceService.reschedule(dto);
    this.logger.log(`Created ${created.length} rescheduled attendance(s)`);
    return created;
  }

  @Post('recompute-return-for-episode')
  @HttpCode(HttpStatus.OK)
  @ApiAttendanceOperation(
    'Recompute and update the return consultation date for the episode containing the given treatment attendance. ' +
    'Reads the current max scheduled session date across all treatment plans in the same consultation, ' +
    'then moves the return assessment attendance if the computed date differs. ' +
    'Call this once after all treatment postpones are committed (next-available mode).',
  )
  @ApiBody({ type: RecomputeReturnForEpisodeDto })
  async recomputeReturnForEpisode(
    @Body() dto: RecomputeReturnForEpisodeDto,
  ): Promise<RecomputeReturnResultDto> {
    this.logger.log(
      `Recomputing return consultation date for episode of attendance ${dto.attendance_id}`,
    );
    const result = await this.attendanceService.recomputeReturnForEpisode(dto.attendance_id);
    this.logger.log(
      result.rescheduled
        ? `Return rescheduled: ${result.old_date} → ${result.new_date}`
        : `Return date unchanged`,
    );
    return result;
  }

  @Get('date/:date')
  @ApiAttendanceOperation('Retrieve attendances for a specific date')
  @ApiParam({
    name: 'date',
    description: 'Date in YYYY-MM-DD format to retrieve attendances for',
    type: 'string',
    example: '2024-01-15',
  })
  async findByDate(
    @Param('date') date: string,
  ): Promise<AttendanceResponseDto[]> {
    this.logger.log(`Retrieving attendances for date ${date}`);

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      this.logger.warn(`Invalid date format: ${date}`);
      throw new ResourceNotFoundException(
        'Invalid date format. Use YYYY-MM-DD',
        date,
      );
    }

    const attendances = await this.attendanceService.findByDate(date);
    this.logger.log(`Found ${attendances.length} attendances for date ${date}`);
    return AttendanceTransformer.toResponseDtoList(attendances);
  }

  @Get('unresolved-past')
  @ApiAttendanceOperation(
    'Get unresolved past attendances (dates before today with incomplete/in-progress statuses)',
  )
  async getUnresolvedPastAttendances(): Promise<{
    hasUnresolved: boolean;
    dates: Array<{
      date: string;
      count: number;
      statuses: string[];
    }>;
  }> {
    this.logger.log('Fetching unresolved past attendances');
    const result = await this.attendanceService.findUnresolvedPastDates();
    this.logger.log(
      `Found ${result.dates.length} dates with unresolved attendances`,
    );
    return result;
  }

  @Get(':id')
  @ApiAttendanceOperation('Retrieve a specific attendance')
  @ApiParam({
    name: 'id',
    description: 'ID of the attendance to retrieve',
    type: 'number',
  })
  async findOne(@Param('id') id: string): Promise<AttendanceResponseDto> {
    this.logger.log(`Retrieving attendance with ID ${id}`);
    const attendance = await this.attendanceService.findOne(+id);
    if (!attendance) {
      this.logger.warn(`Attendance with ID ${id} not found`);
      throw new ResourceNotFoundException('Attendance', id);
    }
    return AttendanceTransformer.toResponseDto(attendance);
  }

  @Patch(':id')
  @ApiUpdateAttendanceOperation()
  @ApiParam({
    name: 'id',
    description: 'ID of the attendance to update',
    type: 'number',
  })
  @ApiBody({ type: UpdateAttendanceDto })
  async update(
    @Param('id') id: string,
    @Body() updateAttendanceDto: UpdateAttendanceDto,
  ): Promise<AttendanceResponseDto> {
    this.logger.log(`Updating attendance with ID ${id}`);
    const attendance = await this.attendanceService.update(
      +id,
      updateAttendanceDto,
    );
    if (!attendance) {
      this.logger.warn(`Attendance with ID ${id} not found`);
      throw new ResourceNotFoundException('Attendance', id);
    }
    this.logger.log(`Successfully updated attendance ${id}`);
    return AttendanceTransformer.toResponseDto(attendance);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAttendanceOperation('Cancel an attendance (set status to cancelled)')
  @ApiParam({
    name: 'id',
    description: 'ID of the attendance to cancel',
    type: 'number',
  })
  async cancel(
    @Param('id') id: string,
    @Body() body?: { cancellation_reason?: string },
  ): Promise<void> {
    this.logger.log(`Cancelling attendance with ID ${id}`);
    const attendance = await this.attendanceService.findOne(+id);
    if (!attendance) {
      this.logger.warn(`Attendance with ID ${id} not found`);
      throw new ResourceNotFoundException('Attendance', id);
    }
    await this.attendanceService.cancel(+id, body?.cancellation_reason);
    this.logger.log(`Successfully cancelled attendance ${id}`);
  }

  @Post('absence-justifications')
  @HttpCode(HttpStatus.OK)
  @ApiAttendanceOperation(
    'Update absence justifications for multiple attendances',
  )
  async updateAbsenceJustifications(
    @Body()
    body: Array<{
      attendanceId: number;
      justified: boolean;
      justification?: string;
    }>,
  ): Promise<void> {
    this.logger.log(
      `Updating absence justifications for ${body.length} attendances`,
    );
    await this.attendanceService.updateAbsenceJustifications(body);
    this.logger.log('Successfully updated absence justifications');
  }

  @Patch(':id/postpone')
  @ApiAttendanceOperation('Postpone an attendance to a specific date')
  @ApiParam({
    name: 'id',
    description: 'ID of the attendance to postpone',
    type: 'number',
  })
  @ApiBody({
    description: 'New scheduled date in YYYY-MM-DD format',
    schema: {
      type: 'object',
      properties: {
        new_date: {
          type: 'string',
          format: 'date',
          description: 'New scheduled date',
          example: '2026-02-12',
        },
      },
      required: ['new_date'],
    },
  })
  async postpone(
    @Param('id') id: string,
    @Body() body: { new_date: string },
  ): Promise<AttendanceResponseDto> {
    this.logger.log(`Postponing attendance ${id} to ${body.new_date}`);
    try {
      const attendance = await this.attendanceService.postpone(+id, body.new_date);
      this.logger.log(
        `Successfully postponed attendance ${id} to ${attendance.scheduled_date}`,
      );
      return AttendanceTransformer.toResponseDto(attendance);
    } catch (error) {
      this.logger.error(`Error postponing attendance ${id}:`, error);
      throw error;
    }
  }

  @Post('bulk/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiAttendanceOperation('Bulk cancel multiple attendances')
  @ApiBody({ type: BulkCancelAttendancesDto })
  async bulkCancel(
    @Body() bulkCancelDto: BulkCancelAttendancesDto,
  ): Promise<BulkOperationResultDto> {
    this.logger.log(
      `Bulk cancelling ${bulkCancelDto.attendance_ids.length} attendances`,
    );
    const result = await this.attendanceService.bulkCancel(
      bulkCancelDto.attendance_ids,
      bulkCancelDto.cancellation_reason,
    );
    this.logger.log(
      `Bulk cancel completed: ${result.success_count} succeeded, ${result.failure_count} failed`,
    );
    return result;
  }

  @Post('bulk/postpone')
  @HttpCode(HttpStatus.OK)
  @ApiAttendanceOperation('Bulk postpone multiple attendances to a specific date')
  @ApiBody({ type: BulkPostponeAttendancesDto })
  async bulkPostpone(
    @Body() bulkPostponeDto: BulkPostponeAttendancesDto,
  ): Promise<BulkOperationResultDto> {
    const result = await this.attendanceService.bulkPostpone(
      bulkPostponeDto.attendance_ids,
      bulkPostponeDto.new_date,
      bulkPostponeDto.reschedule_return_assessment ?? false,
    );
    this.logger.log(
      `Bulk postpone completed: ${result.success_count} succeeded, ${result.failure_count} failed`,
    );
    return result;
  }

  @Post('next-available-date')
  @HttpCode(HttpStatus.OK)
  @ApiAttendanceOperation('Get next available reschedule date per attendance (same weekday)')
  @ApiBody({ type: NextAvailableDateRequestDto })
  async getNextAvailableDate(
    @Body() dto: NextAvailableDateRequestDto,
  ): Promise<NextAvailableDateResponseDto> {
    const dates: Record<number, string | null> = {};
    for (const id of dto.attendance_ids) {
      try {
        dates[id] = await this.attendanceService.getNextAvailableDateForAttendance(id);
      } catch {
        dates[id] = null;
      }
    }
    return { dates };
  }
}
