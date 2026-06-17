import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import {
  Session,
  SessionAttendanceStatus,
} from '../entities/session.entity';
import {
  Treatment,
  TreatmentPlanStatus,
  TreatmentType,
} from '../entities/treatment.entity';
import { Attendance } from '../entities/attendance.entity';
import {
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponseDto,
} from '../dtos/session.dto';
import { toDateStringOnly } from '../utils/date-string-helpers';
import { AttendanceService } from './attendance.service';
import { AttendanceStatus } from '../common/enums';

@Injectable()
export class SessionService {
  constructor(
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(Treatment)
    private treatmentRepository: Repository<Treatment>,
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    @Inject(forwardRef(() => AttendanceService))
    private attendanceService: AttendanceService,
  ) {}

  // ========================
  // CRUD OPERATIONS
  // ========================

  async createSession(
    dto: CreateSessionDto,
  ): Promise<SessionResponseDto> {
    // Validate that the treatment exists
    const treatment = await this.treatmentRepository.findOne({
      where: { id: dto.treatment_id },
    });
    if (!treatment) {
      throw new NotFoundException(
        `Treatment with ID ${dto.treatment_id} not found`,
      );
    }

    const session = this.sessionRepository.create({
      treatment_id: dto.treatment_id,
      session_number: dto.session_number,
      scheduled_date: dto.scheduled_date, // Already a string in YYYY-MM-DD format
      status: SessionAttendanceStatus.SCHEDULED,
      notes: dto.notes,
      performed_by: dto.performed_by,
      attendance_id: dto.attendance_id,
    });

    const saved = await this.sessionRepository.save(session);
    return this.toResponseDto(saved);
  }

  async getSessionsByTreatment(
    treatmentId: number,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.find({
      where: { treatment_id: treatmentId },
      order: { session_number: 'ASC' },
    });

    return sessions.map((session) => this.toResponseDto(session));
  }

  async getSessionsByAttendance(
    attendanceId: number,
  ): Promise<SessionResponseDto[]> {
    const sessions = await this.sessionRepository.find({
      where: { attendance_id: attendanceId },
      relations: ['treatment'],
      order: { session_number: 'ASC' },
    });

    return sessions.map((session) => this.toResponseDto(session));
  }

  /**
   * Get sessions to clone when rescheduling a cancelled/missed attendance.
   * First tries by attendance_id; if none found (e.g. session row was never linked or link was cleared),
   * finds by patient + type + scheduled_date so we still have treatment_id and session_number.
   */
  async getSessionsForReschedule(
    attendanceId: number,
    patientId: number,
    type: 'physiotherapy' | 'tens',
    scheduledDate: string,
  ): Promise<SessionResponseDto[]> {
    const byAttendance = await this.getSessionsByAttendance(attendanceId);
    if (byAttendance.length > 0) {
      return byAttendance;
    }
    const sessionIds = await this.treatmentRepository
      .createQueryBuilder('ts')
      .select('ts.id')
      .where('ts.patient_id = :patientId', { patientId })
      .andWhere('ts.treatment_type = :type', { type })
      .andWhere('ts.status != :cancelled', {
        cancelled: TreatmentPlanStatus.CANCELLED,
      })
      .getMany();
    if (sessionIds.length === 0) {
      return [];
    }
    const ids = sessionIds.map((s) => s.id);
    const sessions = await this.sessionRepository.find({
      where: {
        treatment_id: In(ids),
        scheduled_date: scheduledDate,
      },
      relations: ['treatment'],
      order: { session_number: 'ASC' },
    });
    return sessions.map((session) => this.toResponseDto(session));
  }

  async getSessionsByPatient(
    patientId: number,
  ): Promise<SessionResponseDto[]> {
    // Get all treatments for this patient
    const treatmentsForPatient = await this.treatmentRepository.find({
      where: { patient_id: patientId },
      select: ['id'],
    });

    if (treatmentsForPatient.length === 0) {
      return [];
    }

    const treatmentIds = treatmentsForPatient.map((t) => t.id);

    // Get all sessions for these treatments, including each treatment and the session's attendance (cancellation reason fallback)
    const sessions = await this.sessionRepository
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.treatment', 'treatment')
      .leftJoinAndSelect('session.attendance', 'sessionAttendance')
      .where('session.treatment_id IN (:...treatmentIds)', { treatmentIds })
      .orderBy('session.scheduled_date', 'DESC')
      .addOrderBy('session.session_number', 'DESC')
      .getMany();

    return sessions.map((session) => this.toResponseDto(session));
  }

  async getSessionById(
    id: number,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
    return this.toResponseDto(session);
  }

  async updateSession(
    id: number,
    dto: UpdateSessionDto,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    const previousStatus = session.status;

    // Update fields if provided
    if (dto.start_time !== undefined) session.start_time = dto.start_time;
    if (dto.end_time !== undefined) session.end_time = dto.end_time;
    if (dto.status !== undefined) session.status = dto.status;
    if (dto.notes !== undefined) session.notes = dto.notes;
    if (dto.missed_reason !== undefined)
      session.missed_reason = dto.missed_reason;
    if (dto.performed_by !== undefined) session.performed_by = dto.performed_by;
    if (dto.attendance_id !== undefined)
      session.attendance_id = dto.attendance_id;

    const updated = await this.sessionRepository.save(session);

    // Sync linked attendance status when session status changes (session → attendance)
    if (
      dto.status !== undefined &&
      dto.status !== previousStatus &&
      updated.attendance_id
    ) {
      const attendanceStatus = this.mapSessionStatusToAttendanceStatus(
        updated.status,
      );
      if (attendanceStatus !== null) {
        await this.attendanceService.syncStatusFromSession(
          updated.attendance_id,
          attendanceStatus,
          {
            cancellationReason:
              updated.status === SessionAttendanceStatus.MISSED
                ? updated.missed_reason ?? undefined
                : undefined,
          },
        );
      }
    }

    return this.toResponseDto(updated);
  }

  /**
   * Map session status to attendance status for session→attendance sync.
   * Returns null for SCHEDULED (no sync needed).
   */
  private mapSessionStatusToAttendanceStatus(
    status: SessionAttendanceStatus,
  ): AttendanceStatus | null {
    switch (status) {
      case SessionAttendanceStatus.COMPLETED:
        return AttendanceStatus.COMPLETED;
      case SessionAttendanceStatus.MISSED:
        return AttendanceStatus.MISSED;
      case SessionAttendanceStatus.CANCELLED:
        return AttendanceStatus.CANCELLED;
      default:
        return null;
    }
  }

  async deleteSession(id: number): Promise<void> {
    const result = await this.sessionRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }
  }

  // ========================
  // BUSINESS LOGIC OPERATIONS
  // ========================

  async completeSession(
    id: number,
    attendanceId?: number,
    notes?: string,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['treatment'],
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    // Validate attendance if provided
    if (attendanceId) {
      const attendance = await this.attendanceRepository.findOne({
        where: { id: attendanceId },
      });
      if (!attendance) {
        throw new NotFoundException(
          `Attendance with ID ${attendanceId} not found`,
        );
      }
      session.attendance_id = attendanceId;
    }

    session.status = SessionAttendanceStatus.COMPLETED;

    // Set start_time if not already set
    if (!session.start_time) {
      session.start_time = new Date()
        .toTimeString()
        .split(' ')[0]
        .substring(0, 8); // HH:MM:SS format
    }

    // Set end_time for completion
    session.end_time = new Date().toTimeString().split(' ')[0].substring(0, 8); // HH:MM:SS format

    if (notes) session.notes = notes;

    const updated = await this.sessionRepository.save(session);

    // Update the treatment session's completed count
    await this.updateTreatmentPlanProgress(session.treatment_id);

    return this.toResponseDto(updated);
  }

  async markSessionMissed(
    id: number,
    reason: string,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
    });
    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    session.status = SessionAttendanceStatus.MISSED;
    session.missed_reason = reason;

    const updated = await this.sessionRepository.save(session);
    return this.toResponseDto(updated);
  }

  async rescheduleSession(
    id: number,
    newDate: string,
  ): Promise<SessionResponseDto> {
    const session = await this.sessionRepository.findOne({
      where: { id },
      relations: ['treatment'],
    });

    if (!session) {
      throw new NotFoundException(`Session with ID ${id} not found`);
    }

    session.scheduled_date = newDate; // newDate should already be in YYYY-MM-DD format
    session.status = SessionAttendanceStatus.SCHEDULED;

    const updated = await this.sessionRepository.save(session);
    return this.toResponseDto(updated);
  }

  /**
   * Mark all `hms_session` rows linked to an attendance as MISSED.
   * Used when a physiotherapy/tens attendance is marked as MISSED so that
   * `hms_session.status` stays in sync.
   */
  async markSessionsAsMissedByAttendanceId(
    attendanceId: number,
    reason: string,
  ): Promise<void> {
    const sessions = await this.sessionRepository.find({
      where: {
        attendance_id: attendanceId,
        status: SessionAttendanceStatus.SCHEDULED,
      },
    });

    for (const session of sessions) {
      await this.markSessionMissed(session.id, reason);
    }
  }

  /**
   * Latest scheduled date among session rows with status SCHEDULED for a treatment.
   */
  async getMaxScheduledDateForTreatment(
    treatmentId: number,
  ): Promise<string | null> {
    const sessions = await this.sessionRepository.find({
      where: {
        treatment_id: treatmentId,
        status: SessionAttendanceStatus.SCHEDULED,
      },
      select: ['scheduled_date'],
    });

    if (sessions.length === 0) return null;

    // Normalize to YYYY-MM-DD so we always return string (entity may expose Date at runtime)
    return sessions.reduce<string>(
      (max, r) => {
        const d = toDateStringOnly(r.scheduled_date as string | Date);
        return d > max ? d : max;
      },
      toDateStringOnly(sessions[0].scheduled_date as string | Date),
    );
  }

  /**
   * Set all `hms_session` rows linked to an attendance to cancelled.
   * Used when an attendance (physiotherapy or tens) is cancelled so that
   * `hms_session.status` stays in sync.
   */
  async cancelSessionsByAttendanceId(attendanceId: number): Promise<void> {
    await this.sessionRepository.update(
      {
        attendance_id: attendanceId,
        status: Not(SessionAttendanceStatus.COMPLETED),
      },
      { status: SessionAttendanceStatus.CANCELLED },
    );
  }

  // ========================
  // PRIVATE HELPER METHODS
  // ========================

  private async updateTreatmentPlanProgress(
    treatmentId: number,
  ): Promise<void> {
    const completedCount = await this.sessionRepository.count({
      where: {
        treatment_id: treatmentId,
        status: SessionAttendanceStatus.COMPLETED,
      },
    });

    await this.treatmentRepository.update(treatmentId, {
      completed_sessions: completedCount,
    });
  }

  /**
   * Find active treatment for a patient and modality.
   */
  async findActiveSessionForPatient(
    patientId: number,
    treatmentType: string,
  ): Promise<Treatment | null> {
    return this.treatmentRepository.findOne({
      where: {
        patient_id: patientId,
        treatment_type: treatmentType as TreatmentType,
        status: TreatmentPlanStatus.IN_PROGRESS,
      },
    });
  }

  /**
   * Create a `hms_session` row from a completed attendance.
   */
  async createSessionFromAttendance(
    treatmentId: number,
    attendance: Attendance,
  ): Promise<SessionResponseDto> {
    // Find the next session number for this treatment
    const existingSessions = await this.sessionRepository.find({
      where: { treatment_id: treatmentId },
      order: { session_number: 'DESC' },
    });

    const nextSessionNumber =
      existingSessions.length > 0 ? existingSessions[0].session_number + 1 : 1;

    const session = this.sessionRepository.create({
      treatment_id: treatmentId,
      attendance_id: attendance.id,
      session_number: nextSessionNumber,
      scheduled_date: attendance.scheduled_date,
      start_time: null, // Will be set separately if needed
      end_time: null, // Will be set separately if needed
      status: SessionAttendanceStatus.COMPLETED,
      notes: `Sessão completada automaticamente via atendimento #${attendance.id}`,
      performed_by: 'Sistema', // Could be enhanced to track actual user
    });

    const saved = await this.sessionRepository.save(session);

    // Update the treatment completed session count
    await this.treatmentRepository.update(treatmentId, {
      completed_sessions: nextSessionNumber,
    });

    return this.toResponseDto(saved);
  }

  private toResponseDto(
    session: Session,
  ): SessionResponseDto {
    const dto: SessionResponseDto = {
      id: session.id,
      treatment_id: session.treatment_id,
      attendance_id: session.attendance_id,
      session_number: session.session_number,
      scheduled_date: session.scheduled_date,
      start_time: session.start_time,
      end_time: session.end_time,
      status: session.status,
      notes: session.notes,
      missed_reason: session.missed_reason,
      performed_by: session.performed_by,
      created_date: session.created_date,
      created_time: session.created_time,
      updated_date: session.updated_date,
      updated_time: session.updated_time,
      cancellation_reason: session.attendance?.absence_notes ?? undefined,
    };

    // Include parent treatment when loaded
    if (session.treatment) {
      dto.treatment_type = session.treatment.treatment_type;
      dto.body_location = session.treatment.body_location;
      dto.planned_sessions = session.treatment.planned_sessions;
      dto.completed_sessions = session.treatment.completed_sessions;
      dto.duration_minutes = session.treatment.duration_minutes;
      dto.color = session.treatment.color;
      dto.treatment_notes = session.treatment.notes;
      dto.treatment_status = session.treatment.status;
    }

    return dto;
  }
}
