import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SystemOptionService } from '../services/system-option.service';
import { SystemOptionType } from '../entities/system-option.entity';
import {
  CreateSystemOptionValueDto,
  UpdateSystemOptionDto,
} from '../dtos/system-option.dto';
import { SystemSettingsService } from '../services/system-settings.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import {
  AppointmentsThresholdResponseDto,
  UpdateAppointmentsThresholdDto,
} from '../dtos/appointments-threshold.dto';
import { BulkUpdatePatientsPriorityDto } from '../dtos/priority-management.dto';
import { CreateNoteCategoryDto } from '../dtos/note-category.dto';

@Controller('settings')
export class SettingsController {
  constructor(
    private readonly systemOptionService: SystemOptionService,
    private readonly systemSettingsService: SystemSettingsService,
  ) {}

  @Get('body-locations')
  @UseGuards(JwtAuthGuard)
  async getBodyLocations(@Query('all') includeInactive?: string) {
    return this.systemOptionService.findAllWithUsageCount(
      SystemOptionType.BODY_LOCATION,
      includeInactive === 'true',
    );
  }

  @Get('body-locations/check-similar')
  @UseGuards(JwtAuthGuard)
  async checkSimilarBodyLocations(@Query('value') value: string) {
    if (!value) {
      return [];
    }
    return this.systemOptionService.findSimilar(
      SystemOptionType.BODY_LOCATION,
      value,
    );
  }

  @Post('body-locations')
  @UseGuards(JwtAuthGuard)
  async createBodyLocation(@Body() dto: CreateSystemOptionValueDto) {
    return this.systemOptionService.create({
      type: SystemOptionType.BODY_LOCATION,
      value: dto.value,
    });
  }

  @Put('body-locations/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateBodyLocation(
    @Param('id') id: string,
    @Body() updateDto: UpdateSystemOptionDto,
  ) {
    return this.systemOptionService.update(+id, updateDto);
  }

  @Delete('body-locations/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteBodyLocation(@Param('id') id: string) {
    await this.systemOptionService.delete(+id);
    return { message: 'Body location deleted successfully' };
  }

  @Get('appointments-threshold')
  @UseGuards(JwtAuthGuard)
  async getAppointmentsThreshold(): Promise<AppointmentsThresholdResponseDto> {
    const value =
      await this.systemSettingsService.getMissingAppointmentsThreshold();
    return { missing_appointments_threshold: value };
  }

  @Patch('appointments-threshold')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateAppointmentsThreshold(
    @Body() dto: UpdateAppointmentsThresholdDto,
  ): Promise<AppointmentsThresholdResponseDto> {
    const value =
      await this.systemSettingsService.setMissingAppointmentsThreshold(
        dto.missing_appointments_threshold,
      );
    return { missing_appointments_threshold: value };
  }

  // ===============================
  // Priority management (5 levels)
  // ===============================

  @Get('priorities')
  @UseGuards(JwtAuthGuard)
  async getPriorities(@Query('all') includeInactive?: string) {
    return this.systemOptionService.findAllWithUsageCount(
      SystemOptionType.PRIORITY,
      includeInactive === 'true',
    );
  }

  @Patch('priorities/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updatePriorityOption(
    @Param('id') id: string,
    @Body() updateDto: UpdateSystemOptionDto,
  ) {
    return this.systemOptionService.update(+id, updateDto);
  }

  @Patch('priorities/:id/deactivate')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deactivatePriority(@Param('id') id: string) {
    return this.systemOptionService.deactivatePriority(+id);
  }

  @Patch('patients/bulk-priority')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async bulkUpdatePatientsPriority(@Body() dto: BulkUpdatePatientsPriorityDto) {
    return this.systemOptionService.bulkUpdatePatientsPriority({
      patientIds: dto.patient_ids,
      priorityCode: dto.priority,
    });
  }

  // ===============================
  // Note categories management
  // ===============================

  @Get("note-categories")
  @UseGuards(JwtAuthGuard)
  async getNoteCategories(@Query("all") includeInactive?: string) {
    return this.systemOptionService.findAllWithUsageCount(
      SystemOptionType.NOTE_CATEGORY,
      includeInactive === "true",
    );
  }

  @Post("note-categories")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async createNoteCategory(@Body() dto: CreateNoteCategoryDto) {
    return this.systemOptionService.create({
      type: SystemOptionType.NOTE_CATEGORY,
      value: dto.value,
      label: dto.label,
      sort_order: dto.sort_order,
    });
  }

  @Patch("note-categories/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async updateNoteCategory(
    @Param("id") id: string,
    @Body() updateDto: UpdateSystemOptionDto,
  ) {
    return this.systemOptionService.update(+id, updateDto);
  }

  @Delete("note-categories/:id")
  @UseGuards(JwtAuthGuard, AdminGuard)
  async deleteNoteCategory(@Param("id") id: string) {
    await this.systemOptionService.delete(+id);
    return { message: "Note category deleted successfully" };
  }
}
