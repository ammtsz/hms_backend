import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { HolidayService } from '../services/holiday.service';
import {
  CreateHolidayDto,
  UpdateHolidayDto,
  HolidayResponseDto,
  CreateHolidayPeriodDto,
} from '../dtos/holiday.dto';

@ApiTags('Holidays')
@UseGuards(JwtAuthGuard)
@Controller('holidays')
export class HolidayController {
  private readonly logger = new Logger(HolidayController.name);

  constructor(private readonly holidayService: HolidayService) {}

  @Post()
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new holiday (admin only)' })
  @ApiBody({ type: CreateHolidayDto })
  async create(
    @Body() createHolidayDto: CreateHolidayDto,
  ): Promise<HolidayResponseDto> {
    this.logger.log(
      `Creating holiday: ${createHolidayDto.name} on ${createHolidayDto.holiday_date}`,
    );
    return this.holidayService.create(createHolidayDto);
  }

  @Post('period')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create holiday period (admin only)' })
  @ApiBody({ type: CreateHolidayPeriodDto })
  async createPeriod(@Body() createPeriodDto: CreateHolidayPeriodDto) {
    this.logger.log(`Creating holiday period from ${createPeriodDto.start_date} to ${createPeriodDto.end_date}`);
    return this.holidayService.createHolidayPeriod(createPeriodDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all holidays' })
  @ApiQuery({ name: 'year', required: false, type: Number })
  async findAll(@Query('year') year?: number): Promise<HolidayResponseDto[]> {
    this.logger.log(`Fetching all holidays${year ? ` for year ${year}` : ''}`);
    return this.holidayService.findAll(year);
  }

  @Get('upcoming')
  @ApiOperation({ summary: 'Get upcoming holidays' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getUpcoming(
    @Query('limit') limit?: number,
  ): Promise<HolidayResponseDto[]> {
    const limitValue = limit || 5;
    this.logger.log(`Fetching upcoming ${limitValue} holidays`);
    return this.holidayService.getUpcomingHolidays(limitValue);
  }

  @Get(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Get holiday by ID (admin only)' })
  async findOne(@Param('id') id: string): Promise<HolidayResponseDto> {
    this.logger.log(`Fetching holiday ID ${id}`);
    return this.holidayService.findOne(+id);
  }

  @Get('check/:date')
  @ApiOperation({ summary: 'Check if date is a holiday, optionally for specific treatment type' })
  async checkHoliday(
    @Param('date') date: string,
    @Query('treatment_type') treatmentType?: string,
  ): Promise<{ isHoliday: boolean }> {
    if (treatmentType) {
      this.logger.log(`Checking if ${date} is a holiday that blocks ${treatmentType}`);
      const isHoliday = await this.holidayService.isHolidayForTreatment(date, treatmentType);
      return { isHoliday };
    } else {
      this.logger.log(`Checking if ${date} is a holiday`);
      const isHoliday = await this.holidayService.isHoliday(date);
      return { isHoliday };
    }
  }

  @Get('conflicts/:date')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Check for appointment conflicts on date (admin only)' })
  async checkConflicts(@Param('date') date: string) {
    this.logger.log(`Checking conflicts for date ${date}`);
    return this.holidayService.checkConflicts(date);
  }

  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update holiday (admin only)' })
  @ApiBody({ type: UpdateHolidayDto })
  async update(
    @Param('id') id: string,
    @Body() updateHolidayDto: UpdateHolidayDto,
  ): Promise<HolidayResponseDto> {
    this.logger.log(`Updating holiday ID ${id}`);
    return this.holidayService.update(+id, updateHolidayDto);
  }

  @Patch('group/:groupId')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Update all holidays in a group (admin only)' })
  @ApiBody({ type: UpdateHolidayDto })
  async updateGroup(
    @Param('groupId') groupId: string,
    @Body() updateHolidayDto: UpdateHolidayDto,
  ): Promise<HolidayResponseDto[]> {
    this.logger.log(`Updating holiday group ${groupId}`);
    return this.holidayService.updateGroup(groupId, updateHolidayDto);
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete holiday (admin only)' })
  async remove(@Param('id') id: string): Promise<void> {
    this.logger.log(`Deleting holiday ID ${id}`);
    return this.holidayService.remove(+id);
  }
}
