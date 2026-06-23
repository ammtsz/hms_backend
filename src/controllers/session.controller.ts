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
import { SessionService } from '../services/session.service';
import {
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponseDto,
} from '../dtos/session.dto';
import {
  ApiCreateSessionOperation,
  ApiGetSessionsByTreatmentOperation,
  ApiSessionOperation,
  ApiUpdateSessionOperation,
  ApiDeleteSessionOperation,
  ApiCompleteSessionOperation,
} from '../decorators/api-session.decorator';

@ApiTags('sessions')
@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
  ) {}

  // ========================
  // CRUD ENDPOINTS
  // ========================

  @Post()
  @ApiCreateSessionOperation()
  async createSession(
    @Body(ValidationPipe) dto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    return this.sessionService.createSession(dto);
  }

  @Get('treatment/:treatmentId')
  @ApiGetSessionsByTreatmentOperation()
  async getSessionsByTreatment(
    @Param('treatmentId', ParseIntPipe) treatmentId: number,
  ): Promise<SessionResponseDto[]> {
    return this.sessionService.getSessionsByTreatment(treatmentId);
  }

  @Get('appointment/:appointmentId')
  @ApiSessionOperation('Get sessions by appointment ID')
  async getSessionsByAppointment(
    @Param('appointmentId', ParseIntPipe) appointmentId: number,
  ): Promise<SessionResponseDto[]> {
    return this.sessionService.getSessionsByAppointment(
      appointmentId,
    );
  }

  @Get('patient/:patientId')
  @ApiSessionOperation('Get sessions by patient ID')
  async getSessionsByPatient(
    @Param('patientId', ParseIntPipe) patientId: number,
  ): Promise<SessionResponseDto[]> {
    return this.sessionService.getSessionsByPatient(
      patientId,
    );
  }

  @Get(':id')
  @ApiSessionOperation('Get session by ID')
  async getSessionById(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SessionResponseDto> {
    return this.sessionService.getSessionById(id);
  }

  @Put(':id')
  @ApiUpdateSessionOperation()
  async updateSession(
    @Param('id', ParseIntPipe) id: number,
    @Body(ValidationPipe) dto: UpdateSessionDto,
  ): Promise<SessionResponseDto> {
    return this.sessionService.updateSession(id, dto);
  }

  @Delete(':id')
  @ApiDeleteSessionOperation()
  async deleteSession(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.sessionService.deleteSession(id);
  }

  // ========================
  // BUSINESS LOGIC ENDPOINTS
  // ========================

  @Post(':id/complete')
  @ApiCompleteSessionOperation()
  async completeSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { appointmentId?: number; notes?: string },
  ): Promise<SessionResponseDto> {
    return this.sessionService.completeSession(
      id,
      body.appointmentId,
      body.notes,
    );
  }
}
