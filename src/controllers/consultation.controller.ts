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
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { ConsultationService } from '../services/consultation.service';
import {
  CreateConsultationDto,
  UpdateConsultationDto,
  ConsultationResponseDto,
  UpdateConsultationResponseDto,
  ScheduleReturnDto,
} from '../dtos/consultation.dto';
import {
  ApiCreateConsultationOperation,
  ApiUpdateConsultationOperation,
  ApiDeleteConsultationOperation,
  ApiFindAllConsultationsOperation,
  ApiFindConsultationByAttendanceOperation,
} from '../decorators/api-consultation.decorator';
import { AttendanceResponseDto } from '../dtos/attendance.dto';
import { AttendanceTransformer } from '../transformers/attendance.transformer';

@ApiTags('Consultations')
@UseGuards(JwtAuthGuard)
@Controller('consultations')
export class ConsultationController {
  constructor(private readonly consultationService: ConsultationService) {}

  @Post()
  @ApiCreateConsultationOperation()
  async create(
    @Body() createConsultationDto: CreateConsultationDto,
  ): Promise<UpdateConsultationResponseDto> {
    const result = await this.consultationService.create(
      createConsultationDto,
    );
    return {
      consultation: result.consultation as ConsultationResponseDto,
      cancelled_attendances: result.cancelledAttendances,
    };
  }

  @Get()
  @ApiFindAllConsultationsOperation()
  async findAll(): Promise<ConsultationResponseDto[]> {
    return await this.consultationService.findAll();
  }

  @Get('attendance/:id')
  @ApiFindConsultationByAttendanceOperation()
  async findByAttendance(
    @Param('id') id: string,
  ): Promise<ConsultationResponseDto> {
    return await this.consultationService.findByAttendance(+id);
  }

  @Get('patient/:patientId/latest')
  async findLatestByPatient(
    @Param('patientId') patientId: string,
  ): Promise<ConsultationResponseDto | null> {
    return await this.consultationService.findLatestByPatient(+patientId);
  }

  @Patch(':id')
  @ApiUpdateConsultationOperation()
  async update(
    @Param('id') id: string,
    @Body() updateConsultationDto: UpdateConsultationDto,
  ): Promise<UpdateConsultationResponseDto> {
    const result = await this.consultationService.update(
      +id,
      updateConsultationDto,
    );
    return {
      consultation: result.consultation as ConsultationResponseDto,
      cancelled_attendances: result.cancelledAttendances,
    };
  }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiDeleteConsultationOperation()
  async remove(@Param('id') id: string): Promise<void> {
    await this.consultationService.remove(+id);
  }

  @Post(':id/schedule-return')
  @HttpCode(HttpStatus.CREATED)
  async scheduleReturn(
    @Param('id') id: string,
    @Body() scheduleReturnDto: ScheduleReturnDto,
  ): Promise<{ attendance: AttendanceResponseDto }> {
    const returnAttendance = await this.consultationService.scheduleReturnAttendance(
      +id,
      scheduleReturnDto.mode,
    );
    return {
      attendance: AttendanceTransformer.toResponseDto(returnAttendance),
    };
  }
}
