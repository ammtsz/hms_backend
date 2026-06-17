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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiParam, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ScheduleSettingService } from '../services/schedule-setting.service';
import {
  CreateScheduleSettingDto,
  UpdateScheduleSettingDto,
  ScheduleSettingResponseDto,
} from '../dtos/schedule-setting.dto';
import {
  ApiScheduleSettingOperation,
  ApiCreateScheduleSettingOperation,
  ApiUpdateScheduleSettingOperation,
} from '../decorators/api-schedule-setting.decorator';

@ApiTags('Schedule Settings')
@UseGuards(JwtAuthGuard)
@Controller('schedule-settings')
export class ScheduleSettingController {
  constructor(
    private readonly scheduleSettingService: ScheduleSettingService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiCreateScheduleSettingOperation()
  @ApiBody({ type: CreateScheduleSettingDto })
  async create(
    @Body() createScheduleSettingDto: CreateScheduleSettingDto,
  ): Promise<ScheduleSettingResponseDto> {
    return await this.scheduleSettingService.create(createScheduleSettingDto);
  }

  @Get()
  @ApiScheduleSettingOperation('Get all schedule settings')
  async findAll(): Promise<ScheduleSettingResponseDto[]> {
    return await this.scheduleSettingService.findAll();
  }

  @Get('day/:dayOfWeek')
  @ApiScheduleSettingOperation('Get schedule setting by day of week')
  @ApiParam({
    name: 'dayOfWeek',
    description: 'Day of week (0 = Sunday, 6 = Saturday)',
    type: 'number',
  })
  async findByDay(
    @Param('dayOfWeek') dayOfWeek: string,
  ): Promise<ScheduleSettingResponseDto> {
    return await this.scheduleSettingService.findByDay(+dayOfWeek);
  }

  @Get(':id')
  @ApiScheduleSettingOperation('Get schedule setting by ID')
  @ApiParam({ name: 'id', description: 'Schedule Setting ID' })
  async findOne(@Param('id') id: string): Promise<ScheduleSettingResponseDto> {
    return await this.scheduleSettingService.findOne(+id);
  }

  @Patch(':id')
  @ApiUpdateScheduleSettingOperation()
  @ApiParam({ name: 'id', description: 'Schedule Setting ID' })
  @ApiBody({ type: UpdateScheduleSettingDto })
  async update(
    @Param('id') id: string,
    @Body() updateScheduleSettingDto: UpdateScheduleSettingDto,
  ): Promise<ScheduleSettingResponseDto> {
    return await this.scheduleSettingService.update(
      +id,
      updateScheduleSettingDto,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiScheduleSettingOperation('Delete schedule setting')
  @ApiParam({ name: 'id', description: 'Schedule Setting ID' })
  async remove(@Param('id') id: string): Promise<void> {
    await this.scheduleSettingService.remove(+id);
  }
}
