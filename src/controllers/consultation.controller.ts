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
  ApiFindConsultationByAppointmentOperation,
} from '../decorators/api-consultation.decorator';
import { AppointmentResponseDto } from '../dtos/appointment.dto';
import { AppointmentTransformer } from '../transformers/appointment.transformer';

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
      cancelled_appointments: result.cancelledAppointments,
    };
  }

  @Get()
  @ApiFindAllConsultationsOperation()
  async findAll(): Promise<ConsultationResponseDto[]> {
    return await this.consultationService.findAll();
  }

  @Get('appointment/:id')
  @ApiFindConsultationByAppointmentOperation()
  async findByAppointment(
    @Param('id') id: string,
  ): Promise<ConsultationResponseDto> {
    return await this.consultationService.findByAppointment(+id);
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
      cancelled_appointments: result.cancelledAppointments,
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
  ): Promise<{ appointment: AppointmentResponseDto }> {
    const returnAppointment = await this.consultationService.scheduleReturnAppointment(
      +id,
      scheduleReturnDto.mode,
    );
    return {
      appointment: AppointmentTransformer.toResponseDto(returnAppointment),
    };
  }
}
