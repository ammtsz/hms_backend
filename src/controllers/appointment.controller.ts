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
import { AppointmentType } from '../common/enums';
import { AppointmentService } from '../services/appointment.service';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  AppointmentResponseDto,
  AppointmentScheduleDto,
  NextAppointmentDateDto,
  BulkCancelAppointmentsDto,
  BulkPostponeAppointmentsDto,
  BulkOperationResultDto,
  RescheduleAppointmentsDto,
  EligibleParentOptionsResponseDto,
  NextAvailableDateRequestDto,
  NextAvailableDateResponseDto,
  RecomputeReturnForEpisodeDto,
  RecomputeReturnResultDto,
} from '../dtos/appointment.dto';
import { AppointmentTransformer } from '../transformers/appointment.transformer';
import {
  ApiAppointmentOperation,
  ApiCreateAppointmentOperation,
  ApiUpdateAppointmentOperation,
} from '../decorators/api-appointment.decorator';
import { ResourceNotFoundException } from '../common/exceptions/base.exception';
import { AppointmentStatus } from '../common/enums';
import {
  parseScheduleDateRange,
  parseScheduleStatusQuery,
} from '../common/utils/schedule-query.utils';

@ApiTags('Appointments')
@UseGuards(JwtAuthGuard)
@Controller('appointments')
export class AppointmentController {
  private readonly logger = new Logger(AppointmentController.name);

  constructor(private readonly appointmentService: AppointmentService) { }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateAppointmentOperation()
  @ApiBody({ type: CreateAppointmentDto })
  async create(
    @Body() createAppointmentDto: CreateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    this.logger.log(
      `Creating new appointment for patient ${createAppointmentDto.patient_id}`,
    );
    const appointment = await this.appointmentService.create(createAppointmentDto);
    this.logger.log(
      `Created appointment ${appointment.id} for patient ${appointment.patient_id}`,
    );
    return AppointmentTransformer.toResponseDto(appointment);
  }

  @Get()
  @ApiAppointmentOperation('Retrieve all appointments')
  @ApiQuery({
    name: 'patient_id',
    required: false,
    description: 'Filter by patient ID',
    type: 'number',
  })
  @ApiQuery({
    name: 'from_date',
    required: false,
    description: 'Filter appointments from this date onwards (YYYY-MM-DD)',
    type: 'string',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by appointment status',
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
  ): Promise<AppointmentResponseDto[]> {
    this.logger.log('Retrieving appointments', { patientId, fromDate, status });

    if (patientId) {
      const appointments = await this.appointmentService.findByPatientId(
        +patientId,
        fromDate,
        status as AppointmentStatus,
      );
      this.logger.log(
        `Found ${appointments.length} appointments for patient ${patientId}`,
      );
      return appointments;
    }

    const appointments = await this.appointmentService.findAll();
    this.logger.log(`Found ${appointments.length} appointments`);
    return AppointmentTransformer.toResponseDtoList(appointments);
  }

  @Get('schedule')
  @ApiAppointmentOperation('Get all appointments for schedule view')
  @ApiQuery({
    name: 'status',
    required: false,
    isArray: true,
    description:
      'Filter by appointment status (repeat param: ?status=scheduled&status=checked_in). Omit or empty = all statuses.',
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
    description: 'Filter by appointment type',
    enum: AppointmentType,
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
  ): Promise<AppointmentScheduleDto[]> {
    const statuses = parseScheduleStatusQuery(statusQuery);
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const safeLimit =
      parsedLimit !== undefined &&
      Number.isFinite(parsedLimit) &&
      parsedLimit > 0
        ? parsedLimit
        : undefined;

    const range = parseScheduleDateRange(fromDate, toDate);

    this.logger.log('Fetching all appointments for schedule view', {
      statuses,
      type,
      limit: safeLimit,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });

    const rawData = await this.appointmentService.findAllForSchedule({
      statuses,
      type,
      limit: safeLimit,
      fromDate: range.fromDate,
      toDate: range.toDate,
    });
    return AppointmentTransformer.toScheduleDtoList(rawData);
  }

  @Get('next-date')
  @ApiAppointmentOperation('Get next scheduled appointment date')
  async getNextScheduledDate(): Promise<NextAppointmentDateDto> {
    this.logger.log('Fetching next scheduled appointment date');
    try {
      const nextDate = await this.appointmentService.findNextScheduledDate();
      this.logger.log(`Next scheduled date found: ${nextDate || 'none'}`);
      return AppointmentTransformer.toNextDateDto(nextDate);
    } catch (error) {
      this.logger.error('Error fetching next scheduled date:', error);
      throw error;
    }
  }

  @Get('eligible-parent-options')
  @ApiAppointmentOperation(
    'Get eligible parent (root) appointments for linking a new assessment consultation. Excludes treatments finished with D or C.',
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
    return this.appointmentService.findEligibleParentOptions(+patientId);
  }

  @Get('stats')
  @ApiAppointmentOperation('Get appointment statistics')
  @ApiQuery({
    name: 'date',
    required: false,
    description: 'Date to get stats for (YYYY-MM-DD). Defaults to today.',
    type: 'string',
  })
  async getAppointmentStats(@Query('date') date?: string): Promise<{
    total: number;
    scheduled: number;
    checked_in: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    by_type: { assessment: number; physiotherapy: number; tens: number };
  }> {
    const targetDate = date || new Date().toISOString().split('T')[0];
    this.logger.log(`Fetching appointment statistics for date: ${targetDate}`);

    const stats = await this.appointmentService.getAppointmentStats(targetDate);
    return stats;
  }

  @Post('reschedule')
  @HttpCode(HttpStatus.CREATED)
  @ApiAppointmentOperation(
    'Reschedule cancelled or missed appointments to a new date. Creates new appointment(s) with same params; for physiotherapy/tens also clones or creates treatment session rows.',
  )
  @ApiBody({ type: RescheduleAppointmentsDto })
  async reschedule(
    @Body() dto: RescheduleAppointmentsDto,
  ): Promise<AppointmentResponseDto[]> {
    this.logger.log(
      `Rescheduling ${dto.appointment_ids.length} appointment(s) to ${dto.new_scheduled_date}`,
    );
    const created = await this.appointmentService.reschedule(dto);
    this.logger.log(`Created ${created.length} rescheduled appointment(s)`);
    return created;
  }

  @Post('recompute-return-for-episode')
  @HttpCode(HttpStatus.OK)
  @ApiAppointmentOperation(
    'Recompute and update the return consultation date for the episode containing the given treatment appointment. ' +
    'Reads the current max scheduled session date across all treatment plans in the same consultation, ' +
    'then moves the return assessment appointment if the computed date differs. ' +
    'Call this once after all treatment postpones are committed (next-available mode).',
  )
  @ApiBody({ type: RecomputeReturnForEpisodeDto })
  async recomputeReturnForEpisode(
    @Body() dto: RecomputeReturnForEpisodeDto,
  ): Promise<RecomputeReturnResultDto> {
    this.logger.log(
      `Recomputing return consultation date for episode of appointment ${dto.appointment_id}`,
    );
    const result = await this.appointmentService.recomputeReturnForEpisode(dto.appointment_id);
    this.logger.log(
      result.rescheduled
        ? `Return rescheduled: ${result.old_date} → ${result.new_date}`
        : `Return date unchanged`,
    );
    return result;
  }

  @Get('date/:date')
  @ApiAppointmentOperation('Retrieve appointments for a specific date')
  @ApiParam({
    name: 'date',
    description: 'Date in YYYY-MM-DD format to retrieve appointments for',
    type: 'string',
    example: '2024-01-15',
  })
  async findByDate(
    @Param('date') date: string,
  ): Promise<AppointmentResponseDto[]> {
    this.logger.log(`Retrieving appointments for date ${date}`);

    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      this.logger.warn(`Invalid date format: ${date}`);
      throw new ResourceNotFoundException(
        'Invalid date format. Use YYYY-MM-DD',
        date,
      );
    }

    const appointments = await this.appointmentService.findByDate(date);
    this.logger.log(`Found ${appointments.length} appointments for date ${date}`);
    return AppointmentTransformer.toResponseDtoList(appointments);
  }

  @Get('unresolved-past')
  @ApiAppointmentOperation(
    'Get unresolved past appointments (dates before today with incomplete/in-progress statuses)',
  )
  async getUnresolvedPastAppointments(): Promise<{
    hasUnresolved: boolean;
    dates: Array<{
      date: string;
      count: number;
      statuses: string[];
    }>;
  }> {
    this.logger.log('Fetching unresolved past appointments');
    const result = await this.appointmentService.findUnresolvedPastDates();
    this.logger.log(
      `Found ${result.dates.length} dates with unresolved appointments`,
    );
    return result;
  }

  @Get(':id')
  @ApiAppointmentOperation('Retrieve a specific appointment')
  @ApiParam({
    name: 'id',
    description: 'ID of the appointment to retrieve',
    type: 'number',
  })
  async findOne(@Param('id') id: string): Promise<AppointmentResponseDto> {
    this.logger.log(`Retrieving appointment with ID ${id}`);
    const appointment = await this.appointmentService.findOne(+id);
    if (!appointment) {
      this.logger.warn(`Appointment with ID ${id} not found`);
      throw new ResourceNotFoundException('Appointment', id);
    }
    return AppointmentTransformer.toResponseDto(appointment);
  }

  @Patch(':id')
  @ApiUpdateAppointmentOperation()
  @ApiParam({
    name: 'id',
    description: 'ID of the appointment to update',
    type: 'number',
  })
  @ApiBody({ type: UpdateAppointmentDto })
  async update(
    @Param('id') id: string,
    @Body() updateAppointmentDto: UpdateAppointmentDto,
  ): Promise<AppointmentResponseDto> {
    this.logger.log(`Updating appointment with ID ${id}`);
    const appointment = await this.appointmentService.update(
      +id,
      updateAppointmentDto,
    );
    if (!appointment) {
      this.logger.warn(`Appointment with ID ${id} not found`);
      throw new ResourceNotFoundException('Appointment', id);
    }
    this.logger.log(`Successfully updated appointment ${id}`);
    return AppointmentTransformer.toResponseDto(appointment);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiAppointmentOperation('Cancel an appointment (set status to cancelled)')
  @ApiParam({
    name: 'id',
    description: 'ID of the appointment to cancel',
    type: 'number',
  })
  async cancel(
    @Param('id') id: string,
    @Body() body?: { cancellation_reason?: string },
  ): Promise<void> {
    this.logger.log(`Cancelling appointment with ID ${id}`);
    const appointment = await this.appointmentService.findOne(+id);
    if (!appointment) {
      this.logger.warn(`Appointment with ID ${id} not found`);
      throw new ResourceNotFoundException('Appointment', id);
    }
    await this.appointmentService.cancel(+id, body?.cancellation_reason);
    this.logger.log(`Successfully cancelled appointment ${id}`);
  }

  @Post('absence-justifications')
  @HttpCode(HttpStatus.OK)
  @ApiAppointmentOperation(
    'Update absence justifications for multiple appointments',
  )
  async updateAbsenceJustifications(
    @Body()
    body: Array<{
      appointmentId: number;
      justified: boolean;
      justification?: string;
    }>,
  ): Promise<void> {
    this.logger.log(
      `Updating absence justifications for ${body.length} appointments`,
    );
    await this.appointmentService.updateAbsenceJustifications(body);
    this.logger.log('Successfully updated absence justifications');
  }

  @Patch(':id/postpone')
  @ApiAppointmentOperation('Postpone an appointment to a specific date')
  @ApiParam({
    name: 'id',
    description: 'ID of the appointment to postpone',
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
  ): Promise<AppointmentResponseDto> {
    this.logger.log(`Postponing appointment ${id} to ${body.new_date}`);
    try {
      const appointment = await this.appointmentService.postpone(+id, body.new_date);
      this.logger.log(
        `Successfully postponed appointment ${id} to ${appointment.scheduled_date}`,
      );
      return AppointmentTransformer.toResponseDto(appointment);
    } catch (error) {
      this.logger.error(`Error postponing appointment ${id}:`, error);
      throw error;
    }
  }

  @Post('bulk/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiAppointmentOperation('Bulk cancel multiple appointments')
  @ApiBody({ type: BulkCancelAppointmentsDto })
  async bulkCancel(
    @Body() bulkCancelDto: BulkCancelAppointmentsDto,
  ): Promise<BulkOperationResultDto> {
    this.logger.log(
      `Bulk cancelling ${bulkCancelDto.appointment_ids.length} appointments`,
    );
    const result = await this.appointmentService.bulkCancel(
      bulkCancelDto.appointment_ids,
      bulkCancelDto.cancellation_reason,
    );
    this.logger.log(
      `Bulk cancel completed: ${result.success_count} succeeded, ${result.failure_count} failed`,
    );
    return result;
  }

  @Post('bulk/postpone')
  @HttpCode(HttpStatus.OK)
  @ApiAppointmentOperation('Bulk postpone multiple appointments to a specific date')
  @ApiBody({ type: BulkPostponeAppointmentsDto })
  async bulkPostpone(
    @Body() bulkPostponeDto: BulkPostponeAppointmentsDto,
  ): Promise<BulkOperationResultDto> {
    const result = await this.appointmentService.bulkPostpone(
      bulkPostponeDto.appointment_ids,
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
  @ApiAppointmentOperation('Get next available reschedule date per appointment (same weekday)')
  @ApiBody({ type: NextAvailableDateRequestDto })
  async getNextAvailableDate(
    @Body() dto: NextAvailableDateRequestDto,
  ): Promise<NextAvailableDateResponseDto> {
    const dates: Record<number, string | null> = {};
    for (const id of dto.appointment_ids) {
      try {
        dates[id] = await this.appointmentService.getNextAvailableDateForAppointment(id);
      } catch {
        dates[id] = null;
      }
    }
    return { dates };
  }
}
