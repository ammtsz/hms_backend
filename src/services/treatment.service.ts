import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Treatment,
  TreatmentPlanStatus,
  TreatmentType,
} from '../entities/treatment.entity';
import {
  Session,
  SessionAttendanceStatus,
} from '../entities/session.entity';
import { Consultation } from '../entities/consultation.entity';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { AttendanceType, AttendanceStatus } from '../common/enums';
import {
  CreateTreatmentDto,
  UpdateTreatmentDto,
  TreatmentResponseDto,
} from '../dtos/treatment.dto';
import {
  formatDateToString,
  addDaysToDateString,
  toDateStringOnly,
  compareDateStrings,
} from '../utils/date-string-helpers';
import { AttendanceService } from './attendance.service';

@Injectable()
export class TreatmentService {
  private readonly logger = new Logger(TreatmentService.name);
  
  // Lock map to prevent concurrent return scheduling for the same consultation
  // Key: consultationId, Value: Promise representing the ongoing return scheduling
  private returnSchedulingLocks = new Map<number, Promise<void>>();

  constructor(
    @InjectRepository(Treatment)
    private treatmentRepository: Repository<Treatment>,
    @InjectRepository(Session)
    private sessionRepository: Repository<Session>,
    @InjectRepository(Consultation)
    private consultationRepository: Repository<Consultation>,
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    @Inject(forwardRef(() => AttendanceService))
    private attendanceService: AttendanceService,
  ) {}

  // ========================
  // TREATMENT PLAN METHODS
  // ========================

  async createTreatment(
    dto: CreateTreatmentDto,
  ): Promise<TreatmentResponseDto> {
    // Validate that the consultation exists
    const consultation = await this.consultationRepository.findOne({
      where: { id: dto.consultation_id },
    });
    if (!consultation) {
      throw new NotFoundException(
        `Consultation with ID ${dto.consultation_id} not found`,
      );
    }

    // Validate that the attendance exists
    const attendance = await this.attendanceRepository.findOne({
      where: { id: dto.attendance_id },
    });
    if (!attendance) {
      throw new NotFoundException(
        `Attendance with ID ${dto.attendance_id} not found`,
      );
    }

    // Validate physiotherapy requirements
    if (dto.treatment_type === TreatmentType.PHYSIOTHERAPY) {
      if (!dto.duration_minutes || !dto.color) {
        throw new BadRequestException(
          'Physiotherapy treatments require duration_minutes and color',
        );
      }
    }

    // Use timezone-agnostic string dates
    const treatment = this.treatmentRepository.create({
      consultation_id: dto.consultation_id,
      attendance_id: dto.attendance_id,
      patient_id: dto.patient_id,
      treatment_type: dto.treatment_type,
      body_location: dto.body_location,
      start_date: dto.start_date,
      planned_sessions: dto.planned_sessions,
      completed_sessions: 0,
      end_date: dto.end_date || null,
      status: TreatmentPlanStatus.SCHEDULED,
      duration_minutes: dto.duration_minutes,
      color: dto.color,
      notes: dto.notes,
    });

    const saved = await this.treatmentRepository.save(treatment);

    // Automatically create `hms_session` rows for planned sessions
    if (dto.planned_sessions > 0) {
      await this.createSessionsForTreatment(
        saved.id,
        dto.planned_sessions,
        dto.start_date,
        dto.reuse_attendance_for_first_session
          ? (dto.first_session_attendance_id ?? dto.attendance_id)
          : undefined,
      );
    }

    const withSessions = await this.treatmentRepository.findOne({
      where: { id: saved.id },
      relations: ['sessions'],
    });

    return this.toResponseDto(withSessions ?? saved);
  }

  // NEW METHOD: Bulk create treatments atomically
  async bulkCreateTreatments(
    treatments: CreateTreatmentDto[],
    consultationId: number,
    autoScheduleReturn: boolean = false,
    physiotherapyNotes?: string,
    tensNotes?: string,
  ): Promise<{
    createdTreatments: TreatmentResponseDto[];
    failedTreatments: Array<{ treatment: CreateTreatmentDto; error: string }>;
    returnScheduled: boolean;
    returnSchedulingError?: string;
  }> {
    const createdTreatments: TreatmentResponseDto[] = [];
    const failedTreatments: Array<{ treatment: CreateTreatmentDto; error: string }> = [];
    let returnScheduled = false;
    let returnSchedulingError: string | undefined;

    // Validate schedulable dates (holiday/finalized-adjusted) before creating any session
    const allDates = await this.collectSchedulableDatesFromTreatmentDtos(treatments);
    if (allDates.length > 0) {
      await this.attendanceService.validateTreatmentSlotsForDates(allDates);
    }

    // Create all sessions sequentially to maintain order and ensure proper error tracking
    // Sequential creation also ensures database consistency
    for (const treatmentDto of treatments) {
      try {
        // Apply appropriate notes based on treatment type
        const treatmentWithNotes = {
          ...treatmentDto,
          notes: treatmentDto.treatment_type === TreatmentType.PHYSIOTHERAPY 
            ? (physiotherapyNotes || treatmentDto.notes)
            : treatmentDto.treatment_type === TreatmentType.TENS
            ? (tensNotes || treatmentDto.notes)
            : treatmentDto.notes,
        };
        
        const createdTreatment = await this.createTreatment(treatmentWithNotes);
        createdTreatments.push(createdTreatment);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        failedTreatments.push({
          treatment: treatmentDto,
          error: errorMessage,
        });
      }
    }

    // If auto-schedule return is enabled and at least some treatments were created successfully
    if (autoScheduleReturn && createdTreatments.length > 0) {
      try {
        await this.checkAndScheduleReturnAfterSessionsCreated(consultationId);
        returnScheduled = true;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        returnSchedulingError = errorMessage;
      }
    }

    return {
      createdTreatments,
      failedTreatments,
      returnScheduled,
      returnSchedulingError,
    };
  }

  async getTreatmentsByPatient(
    patientId: number,
  ): Promise<TreatmentResponseDto[]> {
    const treatments = await this.treatmentRepository.find({
      where: { patient_id: patientId },
      relations: ['sessions', 'consultation', 'attendance'],
      order: { created_date: 'DESC', created_time: 'DESC' },
    });

    return treatments.map((treatment) => this.toResponseDto(treatment));
  }

  async getTreatmentById(
    id: number,
  ): Promise<TreatmentResponseDto> {
    const treatment = await this.treatmentRepository.findOne({
      where: { id },
      relations: ['sessions', 'consultation', 'attendance'],
    });

    if (!treatment) {
      throw new NotFoundException(`Treatment with ID ${id} not found`);
    }

    return this.toResponseDto(treatment);
  }

  /**
   * Get session info for return assessment rescheduling logic:
   * attendance_id (episode root), patient_id, return_weeks and return_when_treatment_complete.
   */
  async getSessionWithReturnConfig(
    id: number,
  ): Promise<{
    attendance_id: number;
    patient_id: number;
    consultation_id: number | null;
    return_weeks: number | null;
    return_when_treatment_complete: boolean;
  } | null> {
    const treatment = await this.treatmentRepository.findOne({
      where: { id },
      relations: ['consultation'],
    });

    if (!treatment) return null;

    return {
      attendance_id: treatment.attendance_id,
      patient_id: treatment.patient_id,
      consultation_id: treatment.consultation_id ?? null,
      return_weeks: treatment.consultation?.return_weeks ?? null,
      return_when_treatment_complete:
        treatment.consultation?.return_when_treatment_complete ?? false,
    };
  }

  /**
   * Returns the IDs of all treatments linked to a given consultation.
   * Used by return-date recompute logic to aggregate max session date across all
   * treatment plans created in the same consultation episode.
   */
  async getTreatmentIdsByConsultationId(consultationId: number): Promise<number[]> {
    const treatments = await this.treatmentRepository.find({
      where: { consultation_id: consultationId },
      select: ['id'],
    });
    return treatments.map((t) => t.id);
  }

  async updateTreatment(
    id: number,
    dto: UpdateTreatmentDto,
  ): Promise<TreatmentResponseDto> {
    const treatment = await this.treatmentRepository.findOne({
      where: { id },
      relations: ['sessions'],
    });
    if (!treatment) {
      throw new NotFoundException(`Treatment with ID ${id} not found`);
    }

    const isConfigEdit =
      dto.body_location !== undefined ||
      dto.duration_minutes !== undefined ||
      dto.color !== undefined;

    if (isConfigEdit) {
      const hasCompletedSession =
        treatment.sessions?.some(
          (s) => s.status === SessionAttendanceStatus.COMPLETED,
        ) ?? false;
      if (hasCompletedSession) {
        throw new BadRequestException(
          'The treatment cannot be edited because it already has a completed session',
        );
      }
      if (treatment.treatment_type === TreatmentType.TENS) {
        if (dto.duration_minutes !== undefined || dto.color !== undefined) {
          throw new BadRequestException(
            'Duration and color are only allowed for physiotherapy treatments',
          );
        }
      }
      if (treatment.treatment_type === TreatmentType.PHYSIOTHERAPY) {
        const effectiveDuration =
          dto.duration_minutes ?? treatment.duration_minutes ?? null;
        const effectiveColor =
          (dto.color !== undefined ? dto.color : treatment.color) ?? null;
        if (
          effectiveDuration == null ||
          effectiveColor === null ||
          effectiveColor === ''
        ) {
          throw new BadRequestException(
            'Physiotherapy treatment requires both duration and color',
          );
        }
      }
    }

    // Update fields if provided
    if (dto.completed_sessions !== undefined)
      treatment.completed_sessions = dto.completed_sessions;
    if (dto.end_date !== undefined) treatment.end_date = dto.end_date;
    if (dto.notes !== undefined) treatment.notes = dto.notes;
    if (dto.body_location !== undefined) treatment.body_location = dto.body_location;
    if (dto.duration_minutes !== undefined)
      treatment.duration_minutes = dto.duration_minutes;
    if (dto.color !== undefined) treatment.color = dto.color;

    // Auto-complete if all sessions are done
    if (treatment.completed_sessions >= treatment.planned_sessions) {
      treatment.status = TreatmentPlanStatus.COMPLETED;
      if (!treatment.end_date) {
        treatment.end_date = formatDateToString(new Date());
      }
    }

    const updated = await this.treatmentRepository.save(treatment);
    return this.toResponseDto(updated);
  }

  /**
   * Cancel a treatment and its non-completed session rows.
   * Optionally cancel linked attendances that are still open (scheduled, checked_in, in_progress).
   * Attendance status is owned by AttendanceService: we only delegate, never update directly.
   * When cancelLinkedOpenAttendances is false (e.g. patient transition to D/C), caller has already
   * cancelled open attendances; we must not overwrite MISSED or other statuses.
   */
  async cancelTreatment(
    id: number,
    cancellationReason?: string,
    options?: { cancelLinkedOpenAttendances?: boolean },
  ): Promise<TreatmentResponseDto> {
    const treatment = await this.treatmentRepository.findOne({
      where: { id },
      relations: ['sessions'],
    });

    if (!treatment) {
      throw new NotFoundException(`Treatment with ID ${id} not found`);
    }

    // Update the treatment status to cancelled
    treatment.status = TreatmentPlanStatus.CANCELLED;
    treatment.end_date = formatDateToString(new Date());
    if (cancellationReason) {
      treatment.cancellation_reason = cancellationReason;
    }

    // Update related session rows to cancelled and collect linked attendance IDs
    const attendanceIds: number[] = [];
    if (treatment.sessions && treatment.sessions.length > 0) {
      for (const session of treatment.sessions) {
        if (
          session.status !== SessionAttendanceStatus.COMPLETED &&
          session.status !== SessionAttendanceStatus.MISSED
        ) {
          session.status = SessionAttendanceStatus.CANCELLED;
          await this.sessionRepository.save(session);
          if (session.attendance_id) {
            attendanceIds.push(session.attendance_id);
          }
        }
      }
    }

    // Optionally cancel linked attendances that are still open (only SCHEDULED, CHECKED_IN, IN_PROGRESS).
    // Delegated to AttendanceService so we never overwrite MISSED or COMPLETED.
    const cancelLinked = options?.cancelLinkedOpenAttendances !== false;
    if (cancelLinked && attendanceIds.length > 0) {
      const cancelled = await this.attendanceService.cancelOpenAttendancesByIds(
        attendanceIds,
        cancellationReason,
      );
      if (cancelled.length > 0) {
        this.logger.log(
          `Cancelled ${cancelled.length} linked open attendances for treatment ${id}`,
        );
      }
    }

    const updated = await this.treatmentRepository.save(treatment);
    return this.toResponseDto(updated);
  }

  async bulkCancelTreatments(
    sessionIds: number[],
    cancellationReason?: string,
  ): Promise<{ cancelled_count: number; errors: string[] }> {
    const errors: string[] = [];
    let cancelledCount = 0;

    for (const id of sessionIds) {
      try {
        await this.cancelTreatment(id, cancellationReason);
        cancelledCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        errors.push(`Treatment ${id}: ${errorMessage}`);
        this.logger.error(`Failed to cancel treatment ${id}:`, error);
      }
    }

    return {
      cancelled_count: cancelledCount,
      errors,
    };
  }

  async deleteTreatment(id: number): Promise<void> {
    // First, find the treatment to ensure it exists
    const treatment = await this.treatmentRepository.findOne({
      where: { id },
      relations: ['sessions'],
    });

    if (!treatment) {
      throw new NotFoundException(`Treatment with ID ${id} not found`);
    }

    // Delete all related attendances created for this treatment
    if (
      treatment.sessions &&
      treatment.sessions.length > 0
    ) {
      const attendanceIds = treatment.sessions
        .filter((session) => session.attendance_id)
        .map((session) => session.attendance_id);

      if (attendanceIds.length > 0) {
        await this.attendanceRepository.delete(attendanceIds);
        console.log(
          `🗑️ Deleted ${attendanceIds.length} related attendances for treatment ${id}`,
        );
      }
    }

    // Delete the treatment (session rows cascade)
    const result = await this.treatmentRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Treatment with ID ${id} not found`);
    }
  }

  // ========================
  // PRIVATE HELPER METHODS
  // ========================

  /**
   * Collects schedulable session dates (same logic as createSessionsForTreatment) for slot validation.
   */
  private async collectSchedulableDatesFromTreatmentDtos(
    treatments: CreateTreatmentDto[],
  ): Promise<string[]> {
    const dates: string[] = [];
    for (const treatment of treatments) {
      let currentDate = treatment.start_date;
      for (let i = 0; i < treatment.planned_sessions; i++) {
        const adjustedDate =
          await this.attendanceService.findNextSchedulableDate(
            currentDate,
            treatment.treatment_type,
          );
        dates.push(adjustedDate);
        currentDate = addDaysToDateString(adjustedDate, 7);
      }
    }
    return dates;
  }

  private async createSessionsForTreatment(
    treatmentId: number,
    plannedSessions: number,
    startDate: string,
    reuseAttendanceIdForFirst?: number,
  ): Promise<void> {
    // Get the treatment to access patient_id and treatment_type
    const treatment = await this.treatmentRepository.findOne({
      where: { id: treatmentId },
    });

    if (!treatment) {
      throw new NotFoundException(
        `Treatment with ID ${treatmentId} not found`,
      );
    }

    const sessionsToPersist: Session[] = [];
    // Use timezone-agnostic string date approach
    let currentDateStr = startDate;

    for (let i = 1; i <= plannedSessions; i++) {
      const adjustedDate =
        await this.attendanceService.findNextSchedulableDate(
          currentDateStr,
          treatment.treatment_type,
        );

      const sessionRow = this.sessionRepository.create({
        treatment_id: treatmentId,
        session_number: i,
        scheduled_date: adjustedDate,
        status: SessionAttendanceStatus.SCHEDULED,
      });

      sessionsToPersist.push(sessionRow);

      // Add 7 days for weekly sessions (this could be configurable)
      // Calculate next week from the adjusted (finalized/holiday-aware) date
      currentDateStr = addDaysToDateString(adjustedDate, 7);
    }

    const savedSessions =
      await this.sessionRepository.save(sessionsToPersist);

    // Create attendances for each session row
    const attendanceType =
      treatment.treatment_type === TreatmentType.PHYSIOTHERAPY
        ? AttendanceType.PHYSIOTHERAPY
        : AttendanceType.TENS;

    for (let idx = 0; idx < savedSessions.length; idx++) {
      const sessionRow = savedSessions[idx];
      let attendanceId: number;

      if (idx === 0 && reuseAttendanceIdForFirst !== undefined) {
        // First session row links to the existing attendance (edit-modal context).
        // No new attendance is created, so the session appears immediately in
        // ExpandedTreatmentDetails for the current attendance card.
        attendanceId = reuseAttendanceIdForFirst;
      } else {
        const treatmentSignature = {
          bodyLocation: treatment.body_location,
          color:
            treatment.treatment_type === TreatmentType.PHYSIOTHERAPY
              ? treatment.color
              : undefined,
        };
        await this.attendanceService.assertNoTreatmentSchedulingConflict(
          treatment.patient_id,
          sessionRow.scheduled_date,
          attendanceType,
          treatmentSignature,
        );

        const attendance = this.attendanceRepository.create({
          patient_id: treatment.patient_id,
          type: attendanceType,
          scheduled_time: '19:30',
          status: AttendanceStatus.SCHEDULED,
          notes: '',
          parent_attendance_id: treatment.attendance_id,
          scheduled_date: sessionRow.scheduled_date,
        });
        const savedAttendance = await this.attendanceRepository.save(attendance);
        attendanceId = savedAttendance.id;
      }

      sessionRow.attendance_id = attendanceId;
      await this.sessionRepository.save(sessionRow);
    }
  }

  // NEW METHOD: Check and schedule return AFTER all treatments are created
  async checkAndScheduleReturnAfterSessionsCreated(
    consultationId: number,
  ): Promise<void> {
    // Implement locking to prevent concurrent execution for the same consultation
    const existingLock = this.returnSchedulingLocks.get(consultationId);
    if (existingLock) {
      await existingLock; // Wait for the existing operation to complete
      return; // The first call already handled it
    }

    // Create a new lock for this consultation
    const lockPromise = this._checkAndScheduleReturnAfterSessionsCreatedImpl(consultationId);
    this.returnSchedulingLocks.set(consultationId, lockPromise);

    try {
      await lockPromise;
    } finally {
      // Always clean up the lock when done
      this.returnSchedulingLocks.delete(consultationId);
    }
  }

  // Private implementation (called by the locked public method)
  private async _checkAndScheduleReturnAfterSessionsCreatedImpl(
    consultationId: number,
  ): Promise<void> {
    try {
      // Load consultation for return scheduling
      const consultation = await this.consultationRepository.findOne({
        where: { id: consultationId },
        relations: ['attendance', 'attendance.patient'],
      });

      if (!consultation) {
        return;
      }

      // Only process if flag is true and patient isn't dismissed
      if (
        !consultation.return_when_treatment_complete ||
        consultation.attendance?.patient?.patient_status === 'D'
      ) {
        return;
      }

      // Get all treatments for this consultation
      const consultationTreatments = await this.treatmentRepository.find({
        where: { consultation_id: consultationId },
        relations: ['sessions'],
      });

      if (consultationTreatments.length === 0) return; // No treatments created yet

      // Latest scheduled session date (includes holiday adjustments)
      let latestSessionDate: string | null = null;

      for (const treatment of consultationTreatments) {
        if (treatment.sessions && treatment.sessions.length > 0) {
          for (const session of treatment.sessions) {
            const sessionDateStr = toDateStringOnly(
              session.scheduled_date as string | Date,
            );
            if (
              !latestSessionDate ||
              compareDateStrings(sessionDateStr, latestSessionDate) > 0
            ) {
              latestSessionDate = sessionDateStr;
            }
          }
        }
      }

      // If no session rows found, use the latest treatment's start_date as fallback
      // (this handles cases where sessions weren't fully loaded)
      if (!latestSessionDate) {
        const latestSession = consultationTreatments.reduce((latest, current) => {
          const currentStart = toDateStringOnly(
            current.start_date as string | Date,
          );
          const latestStart = toDateStringOnly(
            latest.start_date as string | Date,
          );
          return compareDateStrings(currentStart, latestStart) > 0
            ? current
            : latest;
        });
        latestSessionDate = toDateStringOnly(
          latestSession.start_date as string | Date,
        );
      }

      this.logger.log(
        `[checkAndScheduleReturnAfterSessionsCreated] Calculating return for consultation ${consultationId}, latestSessionDate: ${latestSessionDate}, returnWeeks: ${consultation.return_weeks}`,
      );

      // Calculate return date: same week of last session + additional return_weeks if specified
      let returnDate = addDaysToDateString(latestSessionDate!, 0); // Start with latest session date 
      if (consultation.return_weeks && consultation.return_weeks > 0) {
        const additionalDays = consultation.return_weeks * 7;
        returnDate = addDaysToDateString(returnDate, additionalDays);
      }

      // Check for holidays and postpone if necessary
      const adjustedDate =
        await this.attendanceService.findNextSchedulableDate(
          returnDate,
          'assessment',
        );

      // Determine parent attendance ID
      const parentAttendanceId =
        consultation.attendance?.parent_attendance_id ||
        consultation.attendance?.id;

      // Create the return attendance
      await this.attendanceService.create({
        patient_id: consultation.attendance.patient_id,
        type: 'assessment' as AttendanceType,
        scheduled_date: adjustedDate,
        scheduled_time: consultation.attendance.scheduled_time,
        notes: `Return automatically scheduled - after treatment creation`,
        parent_attendance_id: parentAttendanceId,
      });

      this.logger.log(
        `Auto-scheduled return consultation for consultation ${consultationId} on ${adjustedDate} (after sessions created)`,
      );
    } catch (error) {
      // Log error but don't throw
      this.logger.error(
        `Error scheduling return consultation for consultation ${consultationId}:`,
        error,
      );
    }
  }

  private toResponseDto(
    treatment: Treatment,
  ): TreatmentResponseDto {
    return {
      id: treatment.id,
      consultation_id: treatment.consultation_id,
      attendance_id: treatment.attendance_id,
      patient_id: treatment.patient_id,
      treatment_type: treatment.treatment_type,
      body_location: treatment.body_location,
      start_date: treatment.start_date,
      planned_sessions: treatment.planned_sessions,
      completed_sessions: treatment.completed_sessions,
      end_date: treatment.end_date,
      status: treatment.status,
      duration_minutes: treatment.duration_minutes,
      color: treatment.color,
      notes: treatment.notes,
      cancellation_reason: treatment.cancellation_reason,
      sessions: treatment.sessions,
      created_date: treatment.created_date,
      created_time: treatment.created_time,
      updated_date: treatment.updated_date,
      updated_time: treatment.updated_time,
    };
  }
}
