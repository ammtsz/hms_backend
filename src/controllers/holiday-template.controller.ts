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
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { HolidayTemplateService } from '../services/holiday-template.service';
import {
  CreateHolidayTemplateDto,
  UpdateHolidayTemplateDto,
  HolidayTemplateResponseDto,
  ApplyHolidayTemplateDto,
  ApplyHolidayTemplateResultDto,
} from '../dtos/holiday-template.dto';

@ApiTags('Holiday Templates')
@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('holiday-templates')
export class HolidayTemplateController {
  private readonly logger = new Logger(HolidayTemplateController.name);

  constructor(private readonly templateService: HolidayTemplateService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create new holiday template' })
  @ApiBody({ type: CreateHolidayTemplateDto })
  async create(
    @Body() createDto: CreateHolidayTemplateDto,
  ): Promise<HolidayTemplateResponseDto> {
    this.logger.log(`Creating holiday template: ${createDto.name}`);
    return this.templateService.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all holiday templates' })
  async findAll(): Promise<HolidayTemplateResponseDto[]> {
    return this.templateService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get holiday template by ID' })
  async findOne(@Param('id') id: string): Promise<HolidayTemplateResponseDto> {
    return this.templateService.findOne(+id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update holiday template' })
  async update(
    @Param('id') id: string,
    @Body() updateDto: UpdateHolidayTemplateDto,
  ): Promise<HolidayTemplateResponseDto> {
    return this.templateService.update(+id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete holiday template' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.templateService.remove(+id);
  }

  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply template to a specific year' })
  @ApiBody({ type: ApplyHolidayTemplateDto })
  async applyTemplate(
    @Param('id') id: string,
    @Body() applyDto: ApplyHolidayTemplateDto,
  ): Promise<ApplyHolidayTemplateResultDto> {
    this.logger.log(
      `Applying template ${id} to year ${applyDto.year}`,
    );
    return this.templateService.applyTemplate(+id, applyDto.year);
  }
}
