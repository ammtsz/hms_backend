import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Appointment } from '../entities/appointment.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentType } from '../entities/treatment.entity';
import {
  CreateAppointmentDto,
  UpdateAppointmentDto,
  AppointmentResponseDto,
  RescheduleAppointmentsDto,
  EligibleParentOptionDto,
  EligibleParentOptionsResponseDto,
} from '../dtos/appointment.dto';
import { ScheduleSetting } from '../entities/schedule-setting.entity';
import {
  AppointmentStatus,
  AppointmentType,
  PatientStatus,
} from '../common/enums';
import {
  ResourceNotFoundException,
  InvalidAppointmentStatusTransitionException,
  AppointmentTimeSlotUnavailableException,
} from '../common/exceptions';
import { SessionService } from './session.service';
import { TreatmentService } from './treatment.service';
import { HolidayService } from './holiday.service';
import { DayFinalizationService } from './day-finalization.service';
import {
  getCurrentDateString,
  getCurrentTimeString,
} from '../utils/datetime-helpers';
import {
  addDaysToDateString,
  formatDisplayDate,
  getDayOfTheWeekName,
  compareDateStrings,
  toDateStringOnly,
} from '../utils/date-string-helpers';
import {
  type TreatmentSchedulingSignature,
  treatmentSignaturesConflict,
} from '../common/utils/scheduling-signature.utils';

export type { TreatmentSchedulingSignature };

/** Only these statuses are considered "open" and can be cancelled when patient goes to C/D. MISSED must never be cancelled. */
const OPEN_APPOINTMENT_STATUSES = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
] as const;

interface BulkPostponeSuccessItem {
  appointment_id: number;
  message: string;
  new_date: string;
}

interface BulkPostponeFailureItem {
  appointment_id: number;
  error: string;
}

interface AutoRescheduledReturnItem {
  appointment_id: number;
  patient_id: number;
  patient_name: string;
  old_date: string;
  new_date: string;
}

interface BulkPostponeResult {
  success_count: number;
  failure_count: number;
  successes: BulkPostponeSuccessItem[];
  failures: BulkPostponeFailureItem[];
  auto_rescheduled_returns: AutoRescheduledReturnItem[];
  failed_return_reschedules: BulkPostponeFailureItem[];
}

interface ReturnRescheduleContext {
  shouldEvaluate: boolean;
  treatmentId: number | null;
  oldLastTreatmentDate: string | null;
}

@Injectable()
export class AppointmentService {
  private readonly logger = new Logger(AppointmentService.name);

  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(ScheduleSetting)
    private scheduleSettingRepository: Repository<ScheduleSetting>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private sessionService: SessionService,
    @Inject(forwardRef(() => TreatmentService))
    private treatmentService: TreatmentService,
    private holidayService: HolidayService,
    private dayFinalizationService: DayFinalizationService,
  ) {}

  async create(createAppointmentDto: CreateAppointmentDto): Promise<Appointment> {
    await this.validateScheduling(createAppointmentDto);
    const appointment = this.appointmentRepository.create(createAppointmentDto);

    // If creating as completed, set all required timestamps
    if (createAppointmentDto.status === AppointmentStatus.COMPLETED) {
      const currentDate = getCurrentDateString();
      const currentTime = getCurrentTimeString();

      appointment.checked_in_time = currentTime;
      appointment.started_time = currentTime;
      appointment.completed_time = currentTime;
    }

    return await this.appointmentRepository.save(appointment);
  }

  async findAll(): Promise<Appointment[]> {
    return await this.appointmentRepository.find({
      relations: ['patient'],
    });
  }

  async findByDate(date: string): Promise<Appointment[]> {
    // Date is already in YYYY-MM-DD string format, use directly
    return await this.appointmentRepository.find({
      where: {
        scheduled_date: date,
      },
      relations: ['patient'],
      order: {
        scheduled_time: 'ASC',
      },
    });
  }

  async findOne(id: number): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id },
      relations: ['patient'],
    });
    if (!appointment) {
      throw new ResourceNotFoundException('Appointment', id);
    }
    return appointment;
  }

  async findByPatientId(
    patientId: number,
    fromDate?: string,
    status?: AppointmentStatus,
  ): Promise<AppointmentResponseDto[]> {
    const queryBuilder = this.appointmentRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.patient', 'patient')
      .where('appointment.patient_id = :patientId', { patientId });

    // Apply date filter if provided
    if (fromDate) {
      queryBuilder.andWhere('appointment.scheduled_date >= :fromDate', {
        fromDate,
      });
    }

    // Apply status filter if provided
    if (status) {
      queryBuilder.andWhere('appointment.status = :status', { status });
    }

    queryBuilder
      .orderBy('appointment.scheduled_date', 'ASC')
      .addOrderBy('appointment.scheduled_time', 'ASC');

    const appointments = await queryBuilder.getMany();
    return appointments.map((appointment) =>
      this.transformToResponseDto(appointment),
    );
  }

  /**
   * Find all open (scheduled, checked_in, in_progress) appointments for a patient.
   * Used when changing patient status to Discharged (D) or Consecutive no-shows (C) to cancel them.
   */
  async findOpenAppointmentsByPatientId(
    patientId: number,
  ): Promise<Appointment[]> {
    return this.appointmentRepository.find({
      where: {
        patient_id: patientId,
        status: In([...OPEN_APPOINTMENT_STATUSES]),
      },
      order: { scheduled_date: 'ASC', scheduled_time: 'ASC' },
    });
  }

  /**
   * Cancel appointments by IDs only if they are open (scheduled, checked_in, in_progress).
   * Does not cancel MISSED or COMPLETED. Used when cancelling a treatment session so linked
   * open appointments are cancelled via AppointmentService (single owner of appointment status).
   */
  async cancelOpenAppointmentsByIds(
    appointmentIds: number[],
    cancellationReason?: string,
  ): Promise<Array<{ id: number; type: string; scheduled_date: string }>> {
    if (appointmentIds.length === 0) return [];
    const appointments = await this.appointmentRepository.find({
      where: { id: In(appointmentIds) },
    });
    const openStatusSet = new Set<string>(OPEN_APPOINTMENT_STATUSES);
    const toCancel = appointments.filter((a) => openStatusSet.has(a.status));
    const ids = toCancel.map((a) => a.id);

    if (ids.length === 0) return [];

    const result = await this.bulkCancel(ids, cancellationReason);
    const successIds = new Set(result.successes.map((s) => s.appointment_id));

    return toCancel
      .filter((a) => successIds.has(a.id))
      .map((a) => ({
        id: a.id,
        type: a.type,
        scheduled_date: a.scheduled_date,
      }));
  }

  /**
   * Cancel all open appointments for a patient (scheduled, checked_in, in_progress).
   * Returns the list of cancelled appointments (id, type, scheduled_date) for reporting.
   * Optionally exclude specific appointment IDs (e.g. the one just completed via consultation flow).
   */
  async cancelOpenAppointmentsForPatient(
    patientId: number,
    cancellationReason: string,
    options?: { excludeAppointmentIds?: number[] },
  ): Promise<Array<{ id: number; type: string; scheduled_date: string }>> {
    const openAppointments =
      await this.findOpenAppointmentsByPatientId(patientId);
    // Defensive: only cancel scheduled, checked_in, in_progress (never missed or completed)
    const openStatusSet = new Set<string>(OPEN_APPOINTMENT_STATUSES);
    let toCancel = openAppointments.filter((a) => openStatusSet.has(a.status));
    const excludeIds = new Set(options?.excludeAppointmentIds ?? []);

    if (excludeIds.size > 0) {
      toCancel = toCancel.filter((a) => !excludeIds.has(a.id));
    }

    const ids = toCancel.map((a) => a.id);

    if (ids.length === 0) {
      return [];
    }

    const result = await this.bulkCancel(ids, cancellationReason);
    const successIds = new Set(result.successes.map((s) => s.appointment_id));

    return toCancel
      .filter((a) => successIds.has(a.id))
      .map((a) => ({
        id: a.id,
        type: a.type,
        scheduled_date: a.scheduled_date,
      }));
  }

  /**
   * Returns eligible parent (root) appointments for linking a new assessment consultation.
   * Excludes roots whose chain has any appointment with patient_status 'D' (Discharged) or 'C' (Consecutive no-shows).
   */
  async findEligibleParentOptions(
    patientId: number,
  ): Promise<EligibleParentOptionsResponseDto> {
    const appointments = await this.appointmentRepository.find({
      where: { patient_id: patientId },
      relations: ['consultation'],
      order: { scheduled_date: 'ASC', scheduled_time: 'ASC' },
    });

    const finishedRootIds = new Set<number>();
    for (const att of appointments) {
      const status = att.consultation?.patient_status;
      if (status === 'D' || status === 'C') {
        const rootId = att.parent_appointment_id ?? att.id;
        finishedRootIds.add(rootId);
      }
    }

    const roots = appointments.filter(
      (a) =>
        a.type === AppointmentType.ASSESSMENT &&
        a.parent_appointment_id == null &&
        !finishedRootIds.has(a.id),
    );

    const options: EligibleParentOptionDto[] = roots
      .map((root) => {
        const mainConcern =
          root.consultation?.main_concern?.trim() || 'No main concern recorded';
        return {
          id: root.id,
          date: root.scheduled_date,
          main_concern: mainConcern,
          label: `${root.scheduled_date} - ${mainConcern}`,
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return { options };
  }

  /**
   * parent_appointment_id is only valid for patients in treatment (T).
   * For D/C (new complaint) or N, the client must not send a parent; stale tabs are rejected here.
   * Also verifies the parent row is an assessment root for this patient and is still eligible (same rules as eligible-parent-options).
   */
  private async assertParentAppointmentAllowedForCreate(
    patientId: number,
    parentAppointmentId: number,
  ): Promise<void> {
    const patient = await this.patientRepository.findOne({
      where: { id: patientId },
      select: ['id', 'patient_status'],
    });
    if (!patient) {
      throw new BadRequestException('Patient not found.');
    }
    if (patient.patient_status !== PatientStatus.IN_TREATMENT) {
      throw new BadRequestException(
        'Main complaint is outdated. The patient is starting a new treatment, so this appointment cannot be linked to a previous consultation. Refresh the page and try again by selecting the "New complaint" option.',
      );
    }

    const parentRow = await this.appointmentRepository.findOne({
      where: { id: parentAppointmentId },
    });
    if (!parentRow) {
      throw new BadRequestException('First consultation not found.');
    }
    if (parentRow.patient_id !== patientId) {
      throw new BadRequestException(
        'The selected first consultation does not belong to this patient.',
      );
    }
    if (parentRow.type !== AppointmentType.ASSESSMENT) {
      throw new BadRequestException(
        'The first consultation must be an assessment consultation.',
      );
    }
    if (parentRow.parent_appointment_id != null) {
      throw new BadRequestException(
        'The first consultation must be the root consultation for the complaint.',
      );
    }

    const eligible = await this.findEligibleParentOptions(patientId);
    const allowedIds = new Set(eligible.options.map((o) => o.id));
    if (!allowedIds.has(parentAppointmentId)) {
      throw new BadRequestException(
        'This first consultation is no longer available for new links (treatment closed). Refresh the page and choose another option.',
      );
    }
  }

  private transformToResponseDto(
    appointment: Appointment,
  ): AppointmentResponseDto {
    return {
      id: appointment.id,
      patient_id: appointment.patient_id,
      type: appointment.type,
      status: appointment.status,
      scheduled_date: appointment.scheduled_date,
      scheduled_time: appointment.scheduled_time,
      checked_in_time: appointment.checked_in_time,
      started_time: appointment.started_time,
      completed_time: appointment.completed_time,
      cancelled_date: appointment.cancelled_date,
      absence_justified: appointment.absence_justified,
      absence_notes: appointment.absence_notes,
      notes: appointment.notes,
      parent_appointment_id: appointment.parent_appointment_id,
      created_at: `${appointment.created_date}T${appointment.created_time}`,
      updated_at: `${appointment.updated_date}T${appointment.updated_time}`,
      patient: appointment.patient,
    };
  }

  async update(
    id: number,
    updateAppointmentDto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    const appointment = await this.findOne(id);

    // Save the original status before any changes
    const originalStatus = appointment.status;

    if (updateAppointmentDto.status) {
      await this.validateStatusTransition(
        appointment.status,
        updateAppointmentDto.status,
      );
    }

    // Always update the updated_date and updated_time
    const updateData: any = {
      ...updateAppointmentDto,
      updated_date: getCurrentDateString(),
      updated_time: getCurrentTimeString(),
    };

    // If status is being changed and corresponding time fields aren't provided,
    // set them automatically (status changes happen on scheduled_date, so we only need time)
    if (
      updateAppointmentDto.status &&
      updateAppointmentDto.status !== appointment.status
    ) {
      const currentTime = getCurrentTimeString();

      switch (updateAppointmentDto.status) {
        case AppointmentStatus.CHECKED_IN:
          if (!updateData.checked_in_time)
            updateData.checked_in_time = currentTime;
          break;
        case AppointmentStatus.IN_PROGRESS:
          if (!updateData.started_time) updateData.started_time = currentTime;
          break;
        case AppointmentStatus.COMPLETED:
          if (!updateData.completed_time)
            updateData.completed_time = currentTime;
          break;
        case AppointmentStatus.CANCELLED:
          // Cancellation might happen on a different date
          if (!updateData.cancelled_date)
            updateData.cancelled_date = getCurrentDateString();
          break;
        // For SCHEDULED status, we don't set any specific timestamp
      }
    }

    this.appointmentRepository.merge(appointment, updateData);
    const updatedAppointment = await this.appointmentRepository.save(appointment);

    // Update patient's missing_appointments_streak based on status change
    // Only update for MISSED and COMPLETED statuses
    if (
      updateAppointmentDto.status &&
      updateAppointmentDto.status !== originalStatus &&
      (updateAppointmentDto.status === AppointmentStatus.MISSED ||
        updateAppointmentDto.status === AppointmentStatus.COMPLETED)
    ) {
      await this.updatePatientMissedStreak(
        updatedAppointment,
        updateAppointmentDto,
      );
    }

    // When physiotherapy/tens appointment is marked MISSED, sync linked sessions
    if (
      updateAppointmentDto.status === AppointmentStatus.MISSED &&
      originalStatus !== AppointmentStatus.MISSED &&
      (updatedAppointment.type === AppointmentType.PHYSIOTHERAPY ||
        updatedAppointment.type === AppointmentType.TENS)
    ) {
      const reason =
        updateAppointmentDto.absence_notes ||
        'Reason not provided at the time of registration';
      await this.sessionService.markSessionsAsMissedByAppointmentId(
        updatedAppointment.id,
        reason,
      );
    }

    // Check if this is a physiotherapy/tens appointment being completed
    if (
      updateAppointmentDto.status === AppointmentStatus.COMPLETED &&
      appointment.status !== AppointmentStatus.COMPLETED &&
      (appointment.type === 'physiotherapy' || appointment.type === 'tens')
    ) {
      await this.handlePhysiotherapyTensCompletion(updatedAppointment);
    }

    return updatedAppointment;
  }

  /**
   * Sync appointment status when a linked `hms_session` row is updated (session → appointment).
   * Updates only status and required timestamps; does NOT run side effects (streak, session
   * sync, handlePhysiotherapyTensCompletion) to avoid loops when the change originated from the session/consultation flow.
   */
  async syncStatusFromSession(
    appointmentId: number,
    status: AppointmentStatus,
    options?: { cancellationReason?: string },
  ): Promise<Appointment> {
    const appointment = await this.findOne(appointmentId);
    const currentTime = getCurrentTimeString();
    const currentDate = getCurrentDateString();

    const updateData: Partial<Appointment> = {
      status,
      updated_date: currentDate,
      updated_time: currentTime,
    };

    if (status === AppointmentStatus.COMPLETED && !appointment.completed_time) {
      updateData.completed_time = currentTime;
    }
    if (status === AppointmentStatus.CANCELLED) {
      updateData.cancelled_date = currentDate;
      updateData.cancelled_time = currentTime;
      updateData.absence_notes = options?.cancellationReason ?? null;
    }
    if (status === AppointmentStatus.MISSED && options?.cancellationReason) {
      updateData.absence_notes = options.cancellationReason;
    }

    this.appointmentRepository.merge(appointment, updateData);
    return await this.appointmentRepository.save(appointment);
  }

  /**
   * Cancel an appointment (soft delete: set status to CANCELLED).
   * Does not allow cancelling COMPLETED or MISSED appointments.
   */
  async cancel(id: number, cancellationReason?: string): Promise<void> {
    // Try to find the appointment first to check status
    const appointment = await this.appointmentRepository.findOne({
      where: { id },
      relations: ['patient'],
    });

    if (!appointment) {
      throw new ResourceNotFoundException('Appointment', id);
    }

    if (appointment.status === AppointmentStatus.COMPLETED) {
      throw new InvalidAppointmentStatusTransitionException(
        id,
        appointment.status,
        'CANCELLED',
      );
    }

    // Do not overwrite MISSED with CANCELLED (e.g. end-of-day: keep today's missed as missed, only cancel future open ones)
    if (appointment.status === AppointmentStatus.MISSED) {
      throw new InvalidAppointmentStatusTransitionException(
        id,
        appointment.status,
        AppointmentStatus.CANCELLED,
      );
    }

    appointment.status = AppointmentStatus.CANCELLED;
    appointment.cancelled_date = new Date().toISOString().split('T')[0];
    appointment.cancelled_time = new Date()
      .toTimeString()
      .split(' ')[0]
      .substring(0, 8);
    appointment.absence_justified = cancellationReason ? true : false;
    appointment.absence_notes = cancellationReason || 'Unjustified';

    await this.appointmentRepository.save(appointment);

    // Keep treatment sessions in sync: mark linked sessions as cancelled
    if (
      appointment.type === AppointmentType.PHYSIOTHERAPY ||
      appointment.type === AppointmentType.TENS
    ) {
      await this.sessionService.cancelSessionsByAppointmentId(appointment.id);
    }
  }

  async updateAbsenceJustifications(
    absenceJustifications: Array<{
      appointmentId: number;
      justified: boolean;
      justification?: string;
    }>,
  ): Promise<void> {
    for (const absence of absenceJustifications) {
      const appointment = await this.appointmentRepository.findOne({
        where: { id: absence.appointmentId },
      });

      if (appointment) {
        appointment.status = AppointmentStatus.CANCELLED;
        appointment.cancelled_date = new Date().toISOString().split('T')[0];
        appointment.cancelled_time = new Date()
          .toTimeString()
          .split(' ')[0]
          .substring(0, 8);
        appointment.absence_justified = absence.justified;
        appointment.absence_notes = absence.justification || null;

        await this.appointmentRepository.save(appointment);

        if (
          appointment.type === AppointmentType.PHYSIOTHERAPY ||
          appointment.type === AppointmentType.TENS
        ) {
          await this.sessionService.cancelSessionsByAppointmentId(appointment.id);
        }
      }
    }
  }

  /**
   * Treatment signature from linked session rows (body location).
   */
  async getTreatmentSignatureForAppointmentId(
    appointmentId: number,
  ): Promise<TreatmentSchedulingSignature | null> {
    const sessions =
      await this.sessionService.getSessionsByAppointment(appointmentId);
    const first = sessions.find((s) => s.body_location?.trim());
    if (!first?.body_location) {
      return null;
    }
    return {
      bodyLocation: first.body_location,
    };
  }

  /**
   * BR-306: true when an open appointment on the same date already covers this signature.
   */
  async hasConflictingOpenTreatmentAppointment(
    patientId: number,
    scheduledDate: string,
    type: AppointmentType.PHYSIOTHERAPY | AppointmentType.TENS,
    signature: TreatmentSchedulingSignature,
    excludeAppointmentIds: number[] = [],
  ): Promise<boolean> {
    const exclude = new Set(excludeAppointmentIds);
    const openOnDate = await this.appointmentRepository.find({
      where: {
        patient_id: patientId,
        scheduled_date: scheduledDate,
        type,
        status: In([...OPEN_APPOINTMENT_STATUSES]),
      },
      select: ['id'],
    });

    for (const row of openOnDate) {
      if (exclude.has(row.id)) {
        continue;
      }
      const otherSig = await this.getTreatmentSignatureForAppointmentId(row.id);
      if (otherSig && treatmentSignaturesConflict(type, signature, otherSig)) {
        return true;
      }
    }
    return false;
  }

  private throwTreatmentSchedulingConflict(
    type: AppointmentType.PHYSIOTHERAPY | AppointmentType.TENS,
  ): never {
    const detail = 'body location';
    throw new BadRequestException(
      `This patient already has a ${type === AppointmentType.PHYSIOTHERAPY ? 'physiotherapy' : 'TENS'} appointment scheduled for this date with the same ${detail}.`,
    );
  }

  async assertNoTreatmentSchedulingConflict(
    patientId: number,
    scheduledDate: string,
    type: AppointmentType.PHYSIOTHERAPY | AppointmentType.TENS,
    signature: TreatmentSchedulingSignature,
    excludeAppointmentIds: number[] = [],
  ): Promise<void> {
    const hasConflict = await this.hasConflictingOpenTreatmentAppointment(
      patientId,
      scheduledDate,
      type,
      signature,
      excludeAppointmentIds,
    );
    if (hasConflict) {
      this.throwTreatmentSchedulingConflict(type);
    }
  }

  private async validateScheduling(
    dto: CreateAppointmentDto,
    options?: {
      skipCompletedRootAssessmentCheck?: boolean;
      treatmentSignature?: TreatmentSchedulingSignature;
      excludeAppointmentIds?: number[];
    },
  ): Promise<void> {
    if (dto.parent_appointment_id != null) {
      await this.assertParentAppointmentAllowedForCreate(
        dto.patient_id,
        dto.parent_appointment_id,
      );
    }

    // Assessment without parent: rules by patient_status — open root first, then T vs N vs D/C.
    // Skip entire block when rescheduling (skipCompletedRootAssessmentCheck).
    const skipRootCheck = options?.skipCompletedRootAssessmentCheck === true;
    const parentId = dto.parent_appointment_id;
    if (
      !skipRootCheck &&
      (parentId === undefined || parentId === null) &&
      dto.type === AppointmentType.ASSESSMENT
    ) {
      const patient = await this.patientRepository.findOne({
        where: { id: dto.patient_id },
        select: ['id', 'patient_status'],
      });
      const allowNewRootAssessmentWithoutParent =
        patient?.patient_status === PatientStatus.DISCHARGED ||
        patient?.patient_status === PatientStatus.CONSECUTIVE_NO_SHOWS;

      const inTreatment =
        patient?.patient_status === PatientStatus.IN_TREATMENT;

      // No more than one open root assessment (parent null) at a time (N, T, D/C).
      const openRoot = await this.appointmentRepository.findOne({
        where: {
          patient_id: dto.patient_id,
          type: AppointmentType.ASSESSMENT,
          parent_appointment_id: IsNull(),
          status: In(OPEN_APPOINTMENT_STATUSES),
        },
        relations: ['patient'],
        order: { scheduled_date: 'ASC' },
      });
      if (openRoot) {
        const patient_name = openRoot.patient?.name ?? '';
        const scheduled_date = formatDisplayDate(openRoot.scheduled_date);
        throw new BadRequestException(
          `The patient ${patient_name + ' '}has not yet completed the first consultation scheduled for ${scheduled_date}. Complete this consultation before scheduling a new one.`,
        );
      }

      // In treatment (T): always link to the main complaint (never schedule a root assessment without a parent).
      if (inTreatment) {
        throw new BadRequestException(
          'Select the main complaint (previous consultation) related to this appointment. If the list does not appear, refresh the page and try again.',
        );
      }

      // New patient (N) or unknown status: block "first appointment" if any completed root exists.
      // D/C: skip — "New complaint" is allowed when there is no open root (checked above).
      if (!allowNewRootAssessmentWithoutParent) {
        const completedRootCount = await this.appointmentRepository.count({
          where: {
            patient_id: dto.patient_id,
            type: AppointmentType.ASSESSMENT,
            status: AppointmentStatus.COMPLETED,
            parent_appointment_id: IsNull(),
          },
        });
        if (completedRootCount > 0) {
          throw new BadRequestException(
            'Select the main complaint (previous consultation) related to this appointment. If the list does not appear, refresh the page and try again.',
          );
        }
      }
    }

    // Block scheduling on finalized days
    const finalization =
      await this.dayFinalizationService.getFinalizationStatus(
        dto.scheduled_date,
      );
    if (finalization) {
      throw new BadRequestException(
        'Day already finalized. It is no longer possible to schedule appointments for this day.',
      );
    }

    // Check if date is a holiday that blocks this specific treatment type (Challenge 1A)
    const isBlockedByHoliday = await this.holidayService.isHolidayForTreatment(
      dto.scheduled_date,
      dto.type,
    );
    if (isBlockedByHoliday) {
      const treatmentTypeNames = {
        assessment: 'Assessment consultations',
        physiotherapy: 'Physiotherapy',
        tens: 'TENS',
      };
      const treatmentName =
        treatmentTypeNames[dto.type as keyof typeof treatmentTypeNames] ||
        dto.type;
      throw new BadRequestException(
        `This date is a holiday and it is not possible to schedule ${treatmentName}.`,
      );
    }

    // BR-306: assessment — at most one open per patient per day
    if (dto.type === AppointmentType.ASSESSMENT) {
      const existingAssessment = await this.appointmentRepository.count({
        where: {
          patient_id: dto.patient_id,
          scheduled_date: dto.scheduled_date,
          type: AppointmentType.ASSESSMENT,
          status: In(OPEN_APPOINTMENT_STATUSES),
          ...(options?.excludeAppointmentIds?.length
            ? { id: Not(In(options.excludeAppointmentIds)) }
            : {}),
        },
      });
      if (existingAssessment > 0) {
        throw new BadRequestException(
          'This patient already has a consultation scheduled for this date. Check the appointment list.',
        );
      }
    }

    // BR-306: physiotherapy / tens — used on reschedule (signature from linked sessions)
    if (
      (dto.type === AppointmentType.PHYSIOTHERAPY ||
        dto.type === AppointmentType.TENS) &&
      options?.treatmentSignature
    ) {
      await this.assertNoTreatmentSchedulingConflict(
        dto.patient_id,
        dto.scheduled_date,
        dto.type,
        options.treatmentSignature,
        options?.excludeAppointmentIds ?? [],
      );
    }

    // Parse date string to get day of week for validation
    const [year, month, day] = dto.scheduled_date.split('-').map(Number);
    const scheduledDate = new Date(year, month - 1, day); // month is 0-indexed
    const dayOfWeek = scheduledDate.getDay();

    const setting = await this.scheduleSettingRepository.findOne({
      where: {
        day_of_week: dayOfWeek,
        is_active: true,
      },
    });

    if (!setting) {
      throw new BadRequestException(
        'No schedule is available for this date. Choose another day.',
      );
    }

    // Check if the time is within operational hours
    if (
      dto.scheduled_time < setting.start_time ||
      dto.scheduled_time > setting.end_time
    ) {
      throw new AppointmentTimeSlotUnavailableException(
        dto.scheduled_date,
        dto.scheduled_time,
        dto.type,
      );
    }

    // Check concurrent appointments using string date
    const concurrent = await this.appointmentRepository.count({
      where: {
        scheduled_date: dto.scheduled_date,
        scheduled_time: dto.scheduled_time,
        type: dto.type,
        status: AppointmentStatus.SCHEDULED,
      },
    });

    const maxConcurrent =
      dto.type === 'assessment'
        ? setting.max_concurrent_assessment
        : setting.max_concurrent_physiotherapy_tens;

    if (concurrent >= maxConcurrent) {
      throw new AppointmentTimeSlotUnavailableException(
        dto.scheduled_time,
        setting.start_time,
        setting.end_time,
      );
    }
  }

  /**
   * Validates that all given dates have available treatment slots (physiotherapy/tens).
   * A date has slots if the schedule setting for that day is active and max_concurrent_physiotherapy_tens > 0.
   * @throws BadRequestException if any date has no treatment slots, with message listing invalid dates (BR format).
   */
  async validateTreatmentSlotsForDates(dateStrings: string[]): Promise<void> {
    if (dateStrings.length === 0) return;

    const uniqueDates = [...new Set(dateStrings)];
    const invalidDates: string[] = [];

    for (const dateStr of uniqueDates) {
      const [year, month, day] = dateStr.split('-').map(Number);
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const setting = await this.scheduleSettingRepository.findOne({
        where: { day_of_week: dayOfWeek },
      });
      const hasSlots =
        setting &&
        setting.is_active &&
        (setting.max_concurrent_physiotherapy_tens ?? 0) > 0;
      if (!hasSlots) {
        invalidDates.push(dateStr);
      }
    }

    if (invalidDates.length > 0) {
      const formatted = invalidDates
        .slice()
        .sort()
        .map((d) => formatDisplayDate(d))
        .join(', ');
      throw new BadRequestException(
        `The following dates do not have treatment slots (Physiotherapy/TENS): ${formatted}. Choose dates with available slots in the schedule.`,
      );
    }
  }

  /**
   * Non-throwing check: is a date available for scheduling?
   * Used by end-of-day "next available" logic.
   */
  async isDateAvailableForScheduling(
    date: string,
    type: string,
    options: {
      patientId?: number;
      originalAppointmentId?: number;
      scheduledTime?: string;
    } = {},
  ): Promise<boolean> {
    const {
      patientId,
      originalAppointmentId,
      scheduledTime = '09:00:00',
    } = options;

    const finalization =
      await this.dayFinalizationService.getFinalizationStatus(date);
    if (finalization) return false;

    const isHoliday = await this.holidayService.isHolidayForTreatment(
      date,
      type,
    );
    if (isHoliday) return false;

    const [year, month, day] = date.split('-').map(Number);
    const dayOfWeek = new Date(year, month - 1, day).getDay();
    const setting = await this.scheduleSettingRepository.findOne({
      where: { day_of_week: dayOfWeek, is_active: true },
    });
    if (!setting) return false;

    // Normalize to HH:MM:SS for DB comparison
    const timeForSlot =
      scheduledTime.length >= 8
        ? scheduledTime.slice(0, 8)
        : scheduledTime.length === 5
          ? `${scheduledTime}:00`
          : (scheduledTime || '09:00') + ':00';
    const concurrent = await this.appointmentRepository.count({
      where: {
        scheduled_date: date,
        scheduled_time: timeForSlot,
        type: type as AppointmentType,
        status: AppointmentStatus.SCHEDULED,
      },
    });
    const maxConcurrent =
      type === AppointmentType.ASSESSMENT
        ? setting.max_concurrent_assessment
        : setting.max_concurrent_physiotherapy_tens;
    if (concurrent >= maxConcurrent) return false;

    const appointments = await this.findByDate(date);
    if (originalAppointmentId != null) {
      const hasReschedule = appointments.some(
        (a) => a.rescheduled_from_appointment_id === originalAppointmentId,
      );
      if (hasReschedule) return false;
    }
    if (type === AppointmentType.ASSESSMENT && patientId != null) {
      const hasOtherAssessment = appointments.some(
        (a) =>
          a.patient_id === patientId &&
          a.type === AppointmentType.ASSESSMENT &&
          a.status === AppointmentStatus.SCHEDULED &&
          a.id !== originalAppointmentId,
      );
      if (hasOtherAssessment) return false;
    }

    // BR-306: physiotherapy / tens — same body location on same day
    if (
      (type === AppointmentType.PHYSIOTHERAPY || type === AppointmentType.TENS) &&
      patientId != null &&
      originalAppointmentId != null
    ) {
      const signature =
        await this.getTreatmentSignatureForAppointmentId(originalAppointmentId);
      if (signature) {
        const hasConflict = await this.hasConflictingOpenTreatmentAppointment(
          patientId,
          date,
          type as AppointmentType.PHYSIOTHERAPY | AppointmentType.TENS,
          signature,
          [originalAppointmentId],
        );
        if (hasConflict) return false;
      }
    }

    return true;
  }

  /**
   * Get next available date for an appointment (same weekday): assessment or treatment logic.
   * Used by manage-appointment modal preview and by end-of-day reschedule.
   */
  async getNextAvailableDateForAppointment(
    appointmentId: number,
  ): Promise<string | null> {
    const appointment = await this.findOne(appointmentId);
    const fromDate =
      appointment.scheduled_date ??
      addDaysToDateString(getCurrentDateString(), 7);
    const scheduledTime = appointment.scheduled_time ?? undefined;

    if (appointment.type === AppointmentType.ASSESSMENT) {
      return this.getNextAvailableDateForAssessment(
        appointment.patient_id,
        fromDate,
        appointmentId,
        scheduledTime,
      );
    }

    const treatmentId = await this.getTreatmentIdForAppointment(appointment);
    return this.getNextAvailableDateForTreatment(
      appointment.type,
      appointment.patient_id,
      fromDate,
      appointmentId,
      treatmentId,
      scheduledTime,
    );
  }

  /**
   * Get next available date for assessment appointment (same weekday, next week).
   */
  private async getNextAvailableDateForAssessment(
    patientId: number,
    fromDate: string,
    originalAppointmentId: number,
    scheduledTime?: string,
  ): Promise<string | null> {
    let candidate = addDaysToDateString(fromDate, 7);
    const maxWeeks = 52;

    for (let week = 0; week < maxWeeks; week++) {
      const valid = await this.isDateAvailableForScheduling(
        candidate,
        'assessment',
        { patientId, originalAppointmentId, scheduledTime },
      );
      if (valid) return candidate;
      candidate = addDaysToDateString(candidate, 7);
    }

    return null;
  }

  /**
   * Get treatment id for a physiotherapy/tens appointment (from session rows or by patient+type).
   * Public for use by EndOfDayProcessService (return assessment reschedule).
   */
  async getTreatmentIdForAppointmentId(
    appointmentId: number,
  ): Promise<number | null> {
    const appointment = await this.findOne(appointmentId);
    return this.getTreatmentIdForAppointment(appointment);
  }

  /**
   * Get treatment id for a physiotherapy/tens appointment (from session rows or by patient+type).
   */
  private async getTreatmentIdForAppointment(
    appointment: Appointment,
  ): Promise<number | null> {
    const linkedSessions = await this.sessionService.getSessionsByAppointment(
      appointment.id,
    );
    if (linkedSessions.length > 0 && linkedSessions[0].treatment_id) {
      return linkedSessions[0].treatment_id;
    }
    const sessions = await this.treatmentService.getTreatmentsByPatient(
      appointment.patient_id,
    );
    const match = sessions.find(
      (s) =>
        ((s.treatment_type === TreatmentType.PHYSIOTHERAPY &&
          appointment.type === AppointmentType.PHYSIOTHERAPY) ||
          (s.treatment_type === TreatmentType.TENS &&
            appointment.type === AppointmentType.TENS)) &&
        s.status !== 'cancelled',
    );
    return match ? match.id : null;
  }

  /**
   * Get next available date for physiotherapy/tens (same weekday as original, after last scheduled).
   */
  private async getNextAvailableDateForTreatment(
    type: string,
    patientId: number,
    fromDate: string,
    originalAppointmentId: number,
    treatmentId: number | null,
    scheduledTime?: string,
  ): Promise<string | null> {
    let candidate = addDaysToDateString(fromDate, 7);
    if (treatmentId) {
      const lastDate =
        await this.sessionService.getMaxScheduledDateForTreatment(treatmentId);
      const lastDateStr = lastDate ? toDateStringOnly(lastDate) : null;
      if (lastDateStr && compareDateStrings(candidate, lastDateStr) <= 0) {
        while (compareDateStrings(candidate, lastDateStr) <= 0) {
          candidate = addDaysToDateString(candidate, 7);
        }
      }
    }
    const maxWeeks = 52;

    for (let week = 0; week < maxWeeks; week++) {
      const valid = await this.isDateAvailableForScheduling(candidate, type, {
        patientId,
        originalAppointmentId,
        scheduledTime,
      });
      if (valid) return candidate;
      candidate = addDaysToDateString(candidate, 7);
    }

    return null;
  }

  private async validateStatusTransition(
    currentStatus: string,
    newStatus: string,
  ): Promise<void> {
    const validTransitions: { [key: string]: string[] } = {
      [AppointmentStatus.SCHEDULED]: [
        AppointmentStatus.CHECKED_IN,
        AppointmentStatus.CANCELLED,
        AppointmentStatus.MISSED,
      ],
      [AppointmentStatus.CHECKED_IN]: [
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.IN_PROGRESS,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
      ],
      [AppointmentStatus.IN_PROGRESS]: [
        AppointmentStatus.CHECKED_IN,
        AppointmentStatus.COMPLETED,
        AppointmentStatus.CANCELLED,
      ],
      [AppointmentStatus.COMPLETED]: [
        // Completed appointments cannot be moved to any other status
      ],
      [AppointmentStatus.CANCELLED]: [AppointmentStatus.SCHEDULED],
      [AppointmentStatus.MISSED]: [
        AppointmentStatus.MISSED, // Allow updating missed appointment (e.g., to update absence notes)
        AppointmentStatus.SCHEDULED, // Allow rescheduling missed appointments
      ],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new InvalidAppointmentStatusTransitionException(
        0, // We don't have appointment ID here, it will be filled by the service
        currentStatus,
        newStatus,
      );
    }
  }

  /** Inclusive day count between two YYYY-MM-DD strings (UTC calendar days). */
  private countDaysInclusiveUtc(fromYmd: string, toYmd: string): number {
    const [y1, m1, d1] = fromYmd.split('-').map(Number);
    const [y2, m2, d2] = toYmd.split('-').map(Number);
    const a = Date.UTC(y1, m1 - 1, d1);
    const b = Date.UTC(y2, m2 - 1, d2);
    return Math.floor((b - a) / 86400000) + 1;
  }

  /** Add days to a YYYY-MM-DD string (UTC calendar arithmetic). */
  private addDaysToYmdUtc(fromYmd: string, daysToAdd: number): string {
    const [y, m, d] = fromYmd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + daysToAdd);
    const yy = dt.getUTCFullYear();
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    return `${yy}-${mm}-${dd}`;
  }

  /**
   * Cap inclusive range at 90 days (from fromDate through fromDate+89).
   */
  private clampScheduleDateRange(
    fromDate: string,
    toDate: string,
  ): { fromDate: string; toDate: string } {
    const maxInclusiveDays = 90;
    if (this.countDaysInclusiveUtc(fromDate, toDate) <= maxInclusiveDays) {
      return { fromDate, toDate };
    }
    return {
      fromDate,
      toDate: this.addDaysToYmdUtc(fromDate, maxInclusiveDays - 1),
    };
  }

  // Get all appointments with minimal data for schedule view
  async findAllForSchedule(filters?: {
    statuses?: AppointmentStatus[];
    type?: string;
    limit?: number;
    fromDate?: string;
    toDate?: string;
  }): Promise<any[]> {
    const query = this.appointmentRepository
      .createQueryBuilder('appointment')
      .select([
        'appointment.id',
        'appointment.patient_id',
        'appointment.type',
        'appointment.status',
        'appointment.scheduled_date',
        'appointment.notes',
        'patient.name',
        'patient.priority',
      ])
      .leftJoin('appointment.patient', 'patient');

    if (filters?.statuses?.length) {
      query.andWhere('appointment.status IN (:...statuses)', {
        statuses: filters.statuses,
      });
    }

    if (filters?.type) {
      query.andWhere('appointment.type = :type', { type: filters.type });
    }

    if (filters?.fromDate && filters?.toDate) {
      const { fromDate, toDate } = this.clampScheduleDateRange(
        filters.fromDate,
        filters.toDate,
      );
      query.andWhere('appointment.scheduled_date >= :fromDate', { fromDate });
      query.andWhere('appointment.scheduled_date <= :toDate', { toDate });
    }

    query
      .orderBy('appointment.scheduled_date', 'ASC')
      .addOrderBy('appointment.scheduled_time', 'ASC');

    if (filters?.limit && filters.limit > 0) {
      query.limit(filters.limit);
    }

    return await query.getRawMany();
  }

  // Get the next scheduled appointment date
  async findNextScheduledDate(): Promise<string | null> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of day

      const nextAppointment = await this.appointmentRepository
        .createQueryBuilder('appointment')
        .select('appointment.scheduled_date')
        .where('appointment.scheduled_date >= :today', { today })
        .andWhere('appointment.status != :cancelled', {
          cancelled: AppointmentStatus.CANCELLED,
        })
        .orderBy('appointment.scheduled_date', 'ASC')
        .getOne();

      if (nextAppointment && nextAppointment.scheduled_date) {
        // scheduled_date is now always a string in YYYY-MM-DD format
        return nextAppointment.scheduled_date;
      }

      return null;
    } catch (error) {
      console.error('Error finding next scheduled date:', error);
      throw error;
    }
  }

  // Get appointment statistics for a specific date
  async getAppointmentStats(date: string): Promise<{
    total: number;
    scheduled: number;
    checked_in: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    by_type: { assessment: number; physiotherapy: number; tens: number };
  }> {
    // Use date string directly since scheduled_date is now a string
    const appointments = await this.appointmentRepository.find({
      where: { scheduled_date: date },
    });

    const stats = {
      total: appointments.length,
      scheduled: 0,
      checked_in: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      by_type: { assessment: 0, physiotherapy: 0, tens: 0 },
    };

    appointments.forEach((appointment) => {
      // Count by status
      switch (appointment.status) {
        case AppointmentStatus.SCHEDULED:
          stats.scheduled++;
          break;
        case AppointmentStatus.CHECKED_IN:
          stats.checked_in++;
          break;
        case AppointmentStatus.IN_PROGRESS:
          stats.in_progress++;
          break;
        case AppointmentStatus.COMPLETED:
          stats.completed++;
          break;
        case AppointmentStatus.CANCELLED:
          stats.cancelled++;
          break;
      }

      // Count by type
      if (appointment.type === 'assessment') {
        stats.by_type.assessment++;
      } else if (appointment.type === 'physiotherapy') {
        stats.by_type.physiotherapy++;
      } else if (appointment.type === 'tens') {
        stats.by_type.tens++;
      }
    });

    return stats;
  }

  /**
   * Update patient's missing_appointments_streak based on appointment status change
   */
  private async updatePatientMissedStreak(
    appointment: Appointment,
    updateDto: UpdateAppointmentDto,
  ): Promise<void> {
    const patient = await this.patientRepository.findOne({
      where: { id: appointment.patient_id },
    });

    if (!patient) {
      console.error(
        `Patient ${appointment.patient_id} not found when updating missed streak`,
      );
      return;
    }

    // If appointment is COMPLETED, reset the streak
    if (updateDto.status === AppointmentStatus.COMPLETED) {
      patient.missing_appointments_streak = 0;
      await this.patientRepository.save(patient);
      return;
    }

    if (updateDto.status !== AppointmentStatus.MISSED) {
      return;
    }

    const scheduledDate = appointment.scheduled_date;
    if (!scheduledDate) {
      return;
    }

    // If the patient completed any appointment on this same day,
    // we don't consider it as a "missed day" for streak purposes.
    const completedSameDayCount = await this.appointmentRepository.count({
      where: {
        patient_id: appointment.patient_id,
        scheduled_date: scheduledDate,
        status: AppointmentStatus.COMPLETED,
      },
    });
    if (completedSameDayCount > 0) {
      return;
    }

    // If appointment is marked as MISSED
    if (updateDto.absence_justified === false) {
      // Dedupe by patient + scheduled_date: only increment once per day,
      // even if the patient missed multiple appointments that day.
      const otherUnjustifiedMissedSameDayCount =
        await this.appointmentRepository.count({
          where: {
            patient_id: appointment.patient_id,
            scheduled_date: scheduledDate,
            status: AppointmentStatus.MISSED,
            absence_justified: false,
            id: Not(appointment.id),
          },
        });

      if (otherUnjustifiedMissedSameDayCount === 0) {
        patient.missing_appointments_streak += 1;
        await this.patientRepository.save(patient);
      }
      return;
    }

    if (updateDto.absence_justified === true) {
      // Only reset if there isn't any other unjustified miss on the same day.
      // This avoids a "justified" missed appointment wiping out a day that also
      // has an unjustified miss.
      const anyUnjustifiedMissedSameDayCount =
        await this.appointmentRepository.count({
          where: {
            patient_id: appointment.patient_id,
            scheduled_date: scheduledDate,
            status: AppointmentStatus.MISSED,
            absence_justified: false,
          },
        });

      if (anyUnjustifiedMissedSameDayCount === 0) {
        patient.missing_appointments_streak = 0;
        await this.patientRepository.save(patient);
      }
      return;
    }
  }

  /**
   * Handle completion of physiotherapy/tens appointments by creating treatment sessions
   */
  private async handlePhysiotherapyTensCompletion(
    appointment: Appointment,
  ): Promise<void> {
    try {
      // Look for existing treatment sessions for this patient and treatment type
      const existingSession =
        await this.sessionService.findActiveSessionForPatient(
          appointment.patient_id,
          appointment.type,
        );

      if (existingSession) {
        // Create a new session for this completed appointment
        await this.sessionService.createSessionFromAppointment(
          existingSession.id,
          appointment,
        );
      } else {
        // Log that no active treatment session was found
        console.warn(
          `No active treatment session found for patient ${appointment.patient_id} ` +
            `and type ${appointment.type}. Appointment ${appointment.id} completed but no session created.`,
        );
      }
    } catch (error) {
      // Log error but don't fail the appointment completion
      console.error(
        `Error creating treatment session for appointment ${appointment.id}:`,
        error,
      );
    }
  }

  /**
   * Postpone an appointment to a specific date
   * Updates the scheduled_date and tracks the postponement in notes
   * @param id - Appointment ID
   * @param newDate - New scheduled date in YYYY-MM-DD format
   */
  async postpone(id: number, newDate: string): Promise<Appointment> {
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }

    const newDateObj = new Date(newDate + 'T00:00:00');

    // Find the appointment
    const appointment = await this.findOne(id);
    const originalDate = appointment.scheduled_date;
    const originalDateObj = new Date(originalDate + 'T00:00:00');

    // Block postponing to a finalized day
    const finalization =
      await this.dayFinalizationService.getFinalizationStatus(newDate);
    if (finalization) {
      throw new BadRequestException(
        'Day finalized. It is no longer possible to schedule appointments for this day.',
      );
    }

    // Check if new date is a holiday that blocks this treatment type
    const isBlockedByHoliday = await this.holidayService.isHolidayForTreatment(
      newDate,
      appointment.type,
    );
    if (isBlockedByHoliday) {
      const treatmentTypeNames = {
        assessment: 'Assessment consultations',
        physiotherapy: 'Physiotherapy',
        tens: 'TENS',
      };
      const treatmentName =
        treatmentTypeNames[
          appointment.type as keyof typeof treatmentTypeNames
        ] || appointment.type;
      throw new BadRequestException(
        `The day ${newDate} is a holiday for ${treatmentName}.`,
      );
    }

    if (
      appointment.type === AppointmentType.PHYSIOTHERAPY ||
      appointment.type === AppointmentType.TENS
    ) {
      const signature = await this.getTreatmentSignatureForAppointmentId(id);
      if (signature) {
        await this.assertNoTreatmentSchedulingConflict(
          appointment.patient_id,
          newDate,
          appointment.type,
          signature,
          [id],
        );
      }
    } else {
      const existingAssessment = await this.appointmentRepository.count({
        where: {
          patient_id: appointment.patient_id,
          scheduled_date: newDate,
          type: AppointmentType.ASSESSMENT,
          status: In(OPEN_APPOINTMENT_STATUSES),
          id: Not(id),
        },
      });
      if (existingAssessment > 0) {
        throw new BadRequestException(
          'This patient already has a consultation scheduled for this date. Check the appointment list.',
        );
      }
    }

    // Check for conflicts at the new date/time
    const concurrent = await this.appointmentRepository.count({
      where: {
        scheduled_date: newDate,
        scheduled_time: appointment.scheduled_time,
        type: appointment.type,
        status: AppointmentStatus.SCHEDULED,
      },
    });

    // Get schedule settings to check max concurrent
    const dayOfWeek = newDateObj.getDay();
    const setting = await this.scheduleSettingRepository.findOne({
      where: {
        day_of_week: dayOfWeek,
        is_active: true,
      },
    });

    if (!setting) {
      throw new Error(
        `Appointments are not available on ${getDayOfTheWeekName(dayOfWeek)}s.`,
      );
    }

    const maxConcurrent =
      appointment.type === 'assessment'
        ? setting.max_concurrent_assessment
        : setting.max_concurrent_physiotherapy_tens;

    if (concurrent >= maxConcurrent) {
      throw new AppointmentTimeSlotUnavailableException(
        newDate,
        appointment.scheduled_time,
        appointment.type,
      );
    }

    // Calculate weeks difference for history tracking
    const diffTime = Math.abs(newDateObj.getTime() - originalDateObj.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const days = Math.ceil(diffDays);
    const daysCount = `${newDateObj < originalDateObj ? '-' : '+'}${days} ${days === 1 ? 'day' : 'days'}`;

    // Update notes to track postponement history
    const postponementNote = `Rescheduled: ${originalDate} → ${newDate} (${daysCount})`;

    let updatedNotes = postponementNote;
    if (appointment.notes) {
      updatedNotes = `${appointment.notes}\n${postponementNote}`;
    }

    // Update the appointment
    appointment.scheduled_date = newDate;
    appointment.notes = updatedNotes;

    const savedAppointment = await this.appointmentRepository.save(appointment);

    // For physiotherapy and tens treatments, also update any linked sessions
    if (appointment.type === 'physiotherapy' || appointment.type === 'tens') {
      const sessionRows = await this.sessionService.getSessionsByAppointment(
        appointment.id,
      );

      for (const sessionRow of sessionRows) {
        // Only update if the session is still scheduled (not completed/missed/cancelled)
        if (sessionRow.status === 'scheduled') {
          await this.sessionService.rescheduleSession(sessionRow.id, newDate);
        }
      }
    }

    return savedAppointment;
  }

  /**
   * Reschedule cancelled or missed appointments to a new date.
   * Creates new appointment(s) with same params and links via rescheduled_from_appointment_id.
   * For physiotherapy/tens, creates new sessions with same treatment_id and session_number.
   */
  async reschedule(
    dto: RescheduleAppointmentsDto,
    options?: { allowFirstAssessmentForNonTreatment?: boolean },
  ): Promise<AppointmentResponseDto[]> {
    const { appointment_ids: appointmentIdsRaw, new_scheduled_date: newDate } =
      dto;

    if (appointmentIdsRaw.length === 0) {
      throw new BadRequestException('appointment_ids cannot be empty.');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
      throw new BadRequestException('New date must be in YYYY-MM-DD format.');
    }

    const appointmentIds = [...new Set(appointmentIdsRaw)];

    const appointments = await this.appointmentRepository.find({
      where: { id: In(appointmentIds) },
      relations: ['patient'],
    });

    if (appointments.length !== appointmentIds.length) {
      const foundIds = new Set(appointments.map((a) => a.id));
      const missing = appointmentIds.filter((id) => !foundIds.has(id));
      throw new ResourceNotFoundException('Appointment', missing.join(', '));
    }

    const allowedStatuses = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.MISSED,
    ];
    const invalid = appointments.filter(
      (a) => !allowedStatuses.includes(a.status),
    );
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Only cancelled or missed appointments can be rescheduled. Invalid IDs: ${invalid.map((a) => a.id).join(', ')}`,
      );
    }

    const patient = appointments[0].patient;
    const isAllowedBypass =
      options?.allowFirstAssessmentForNonTreatment === true &&
      appointments.every(
        (a) =>
          a.type === AppointmentType.ASSESSMENT &&
          a.parent_appointment_id == null,
      );
    if (
      patient.patient_status !== PatientStatus.IN_TREATMENT &&
      !isAllowedBypass
    ) {
      throw new BadRequestException(
        'Patient is not in treatment. Only patients in treatment can reschedule appointments.',
      );
    }

    const alreadyRescheduled = await this.appointmentRepository.find({
      where: { rescheduled_from_appointment_id: In(appointmentIds) },
      select: ['rescheduled_from_appointment_id', 'scheduled_date'],
    });
    if (alreadyRescheduled.length > 0) {
      const existingDate = formatDisplayDate(
        toDateStringOnly(alreadyRescheduled[0].scheduled_date),
      );
      throw new BadRequestException(
        `This appointment has already been rescheduled for ${existingDate}`,
      );
    }

    const timeToCount = new Map<
      string,
      { type: AppointmentType; count: number }
    >();
    for (const a of appointments) {
      const key = `${a.type}:${a.scheduled_time}`;
      const current = timeToCount.get(key) || { type: a.type, count: 0 };
      current.count += 1;
      timeToCount.set(key, current);
    }

    const batchExcludeIds = appointments.map((a) => a.id);

    for (const original of appointments) {
      const scheduledTime =
        original.scheduled_time?.length === 8
          ? original.scheduled_time.substring(0, 5)
          : original.scheduled_time || '09:00';
      const validateDto: CreateAppointmentDto = {
        patient_id: original.patient_id,
        type: original.type,
        scheduled_date: newDate,
        scheduled_time: scheduledTime,
      };
      const treatmentSignature =
        original.type === AppointmentType.PHYSIOTHERAPY ||
        original.type === AppointmentType.TENS
          ? await this.getTreatmentSignatureForAppointmentId(original.id)
          : null;
      await this.validateScheduling(validateDto, {
        skipCompletedRootAssessmentCheck: true,
        treatmentSignature: treatmentSignature ?? undefined,
        excludeAppointmentIds: batchExcludeIds,
      });
    }

    for (const [, { type, count }] of timeToCount) {
      const originalWithType = appointments.find((a) => a.type === type);
      const timeForSlot = originalWithType?.scheduled_time ?? '09:00:00';
      const concurrent = await this.appointmentRepository.count({
        where: {
          scheduled_date: newDate,
          scheduled_time: timeForSlot,
          type,
          status: AppointmentStatus.SCHEDULED,
        },
      });
      const [year, month, day] = newDate.split('-').map(Number);
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const setting = await this.scheduleSettingRepository.findOne({
        where: { day_of_week: dayOfWeek, is_active: true },
      });
      if (!setting) continue;
      const maxConcurrent =
        type === AppointmentType.ASSESSMENT
          ? setting.max_concurrent_assessment
          : setting.max_concurrent_physiotherapy_tens;
      if (concurrent + count > maxConcurrent) {
        throw new AppointmentTimeSlotUnavailableException(
          newDate,
          timeForSlot,
          type,
        );
      }
    }

    const created: Appointment[] = [];
    for (const original of appointments) {
      const newAppointment = this.appointmentRepository.create({
        patient_id: original.patient_id,
        type: original.type,
        status: AppointmentStatus.SCHEDULED,
        scheduled_date: newDate,
        scheduled_time: original.scheduled_time || '09:00:00',
        notes: original.notes ?? undefined,
        parent_appointment_id: original.parent_appointment_id ?? undefined,
        rescheduled_from_appointment_id: original.id,
      });
      const saved = await this.appointmentRepository.save(newAppointment);
      created.push(saved);

      if (original.type === 'physiotherapy' || original.type === 'tens') {
        const sessionRows = await this.sessionService.getSessionsForReschedule(
          original.id,
          original.patient_id,
          original.type,
          original.scheduled_date,
        );
        for (const rec of sessionRows) {
          await this.sessionService.createSession({
            treatment_id: rec.treatment_id,
            appointment_id: saved.id,
            session_number: rec.session_number,
            scheduled_date: newDate,
          });
        }
      }
    }

    return created.map((a) => this.transformToResponseDto(a));
  }

  /**
   * Bulk cancel multiple appointments in a single transaction
   */
  async bulkCancel(
    appointmentIds: number[],
    cancellationReason?: string,
  ): Promise<{
    success_count: number;
    failure_count: number;
    successes: Array<{ appointment_id: number; message: string }>;
    failures: Array<{ appointment_id: number; error: string }>;
  }> {
    const results = {
      success_count: 0,
      failure_count: 0,
      successes: [] as Array<{ appointment_id: number; message: string }>,
      failures: [] as Array<{ appointment_id: number; error: string }>,
    };

    // Process each appointment in a transaction
    for (const id of appointmentIds) {
      try {
        await this.cancel(id, cancellationReason);
        results.success_count++;
        results.successes.push({
          appointment_id: id,
          message: 'Successfully cancelled',
        });
      } catch (error) {
        results.failure_count++;
        results.failures.push({
          appointment_id: id,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    return results;
  }

  /**
   * Bulk postpone multiple appointments to a specific date
   * @param appointmentIds - Array of appointment IDs to postpone
   * @param newDate - New scheduled date in YYYY-MM-DD format for all appointments
   */
  async bulkPostpone(
    appointmentIds: number[],
    newDate: string,
    rescheduleReturnAssessment: boolean = false,
  ): Promise<BulkPostponeResult> {
    const results: BulkPostponeResult = {
      success_count: 0,
      failure_count: 0,
      successes: [],
      failures: [],
      auto_rescheduled_returns: [],
      failed_return_reschedules: [],
    };

    const assessmentReturnRescheduleMap = new Map<number, string>();

    // Process each appointment
    for (const id of appointmentIds) {
      try {
        const appointment = await this.findOne(id);
        const isTreatment =
          appointment.type === AppointmentType.PHYSIOTHERAPY ||
          appointment.type === AppointmentType.TENS;
        const returnRescheduleContext =
          await this.prepareReturnRescheduleContextForAppointment(
            appointment,
            rescheduleReturnAssessment,
            isTreatment,
          );

        const postponedAppointment = await this.postpone(id, newDate);
        results.success_count++;
        results.successes.push({
          appointment_id: id,
          message: 'Successfully postponed',
          new_date: postponedAppointment.scheduled_date,
        });

        await this.collectReturnAssessmentRescheduleCandidates(
          returnRescheduleContext,
          newDate,
          assessmentReturnRescheduleMap,
        );
      } catch (error) {
        results.failure_count++;
        results.failures.push({
          appointment_id: id,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    await this.applyReturnAssessmentReschedules(
      assessmentReturnRescheduleMap,
      results,
    );

    return results;
  }

  private async prepareReturnRescheduleContextForAppointment(
    appointment: Appointment,
    rescheduleReturnAssessment: boolean,
    isTreatment: boolean,
  ): Promise<ReturnRescheduleContext> {
    if (!rescheduleReturnAssessment || !isTreatment) {
      return {
        shouldEvaluate: false,
        treatmentId: null,
        oldLastTreatmentDate: null,
      };
    }

    const treatmentId = await this.getTreatmentIdForAppointmentId(appointment.id);
    if (!treatmentId) {
      return {
        shouldEvaluate: false,
        treatmentId: null,
        oldLastTreatmentDate: null,
      };
    }

    let oldLastTreatmentDate =
      await this.sessionService.getMaxScheduledDateForTreatment(treatmentId);
    if (
      appointment.scheduled_date &&
      (!oldLastTreatmentDate ||
        appointment.scheduled_date > oldLastTreatmentDate)
    ) {
      oldLastTreatmentDate = appointment.scheduled_date;
    }

    return {
      shouldEvaluate: Boolean(oldLastTreatmentDate),
      treatmentId,
      oldLastTreatmentDate,
    };
  }

  private async collectReturnAssessmentRescheduleCandidates(
    context: ReturnRescheduleContext,
    newDate: string,
    assessmentReturnRescheduleMap: Map<number, string>,
  ): Promise<void> {
    if (
      !context.shouldEvaluate ||
      !context.treatmentId ||
      !context.oldLastTreatmentDate
    ) {
      return;
    }

    const returnAssessmentAppointments =
      await this.findReturnAssessmentAppointmentsForTreatment(
        context.treatmentId,
        context.oldLastTreatmentDate,
      );
    const sessionInfo = await this.treatmentService.getSessionWithReturnConfig(
      context.treatmentId,
    );
    const returnWhenComplete =
      sessionInfo?.return_when_treatment_complete ?? false;
    const returnWeeks = sessionInfo?.return_weeks ?? 0;
    const shouldRescheduleReturns =
      returnAssessmentAppointments.length > 0 &&
      (returnWhenComplete || returnWeeks > 0);

    if (!shouldRescheduleReturns) {
      return;
    }

    const returnDate = returnWhenComplete
      ? addDaysToDateString(newDate, returnWeeks * 7)
      : addDaysToDateString(newDate, 7);
    const adjustedReturnDate = await this.findNextSchedulableDate(
      returnDate,
      AppointmentType.ASSESSMENT,
    );

    for (const assessmentAtt of returnAssessmentAppointments) {
      if (assessmentAtt.scheduled_date === adjustedReturnDate) {
        continue;
      }
      const currentBest = assessmentReturnRescheduleMap.get(assessmentAtt.id);
      if (
        !currentBest ||
        compareDateStrings(adjustedReturnDate, currentBest) > 0
      ) {
        assessmentReturnRescheduleMap.set(assessmentAtt.id, adjustedReturnDate);
      }
    }
  }

  private async applyReturnAssessmentReschedules(
    assessmentReturnRescheduleMap: Map<number, string>,
    results: BulkPostponeResult,
  ): Promise<void> {
    for (const [
      assessmentAppointmentId,
      targetDate,
    ] of assessmentReturnRescheduleMap) {
      try {
        const assessmentAppointment = await this.findOne(assessmentAppointmentId);
        if (assessmentAppointment.scheduled_date === targetDate) {
          continue;
        }
        const previousDate = assessmentAppointment.scheduled_date;
        await this.postpone(assessmentAppointmentId, targetDate);
        results.auto_rescheduled_returns.push({
          appointment_id: assessmentAppointmentId,
          patient_id: assessmentAppointment.patient_id,
          patient_name: assessmentAppointment.patient?.name ?? 'Patient',
          old_date: previousDate,
          new_date: targetDate,
        });
      } catch (error) {
        results.failed_return_reschedules.push({
          appointment_id: assessmentAppointmentId,
          error:
            error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }
  }

  /**
   * Find assessment return appointments in the same episode that should move with treatment postponement.
   * Includes only scheduled assessment appointments with scheduled_date >= minScheduledDate.
   */
  private async findReturnAssessmentAppointmentsForTreatment(
    treatmentId: number,
    minScheduledDate: string,
  ): Promise<Appointment[]> {
    const sessionInfo =
      await this.treatmentService.getSessionWithReturnConfig(treatmentId);
    if (!sessionInfo) return [];

    const patientAppointments = await this.findByPatientId(
      sessionInfo.patient_id,
    );
    const rootId = sessionInfo.appointment_id;
    const chainIds = new Set<number>([rootId]);

    let added = true;
    while (added) {
      added = false;
      for (const attDto of patientAppointments) {
        const parentId = attDto.parent_appointment_id;
        if (
          parentId != null &&
          chainIds.has(parentId) &&
          !chainIds.has(attDto.id)
        ) {
          chainIds.add(attDto.id);
          added = true;
        }
      }
    }

    const assessmentAppointments: Appointment[] = [];
    for (const attDto of patientAppointments) {
      if (
        attDto.type === AppointmentType.ASSESSMENT &&
        attDto.status === AppointmentStatus.SCHEDULED &&
        attDto.parent_appointment_id != null &&
        chainIds.has(attDto.parent_appointment_id) &&
        attDto.scheduled_date >= minScheduledDate
      ) {
        const fullAppointment = await this.findOne(attDto.id);
        assessmentAppointments.push(fullAppointment);
      }
    }

    return assessmentAppointments;
  }

  /**
   * Find the next date that passes all scheduling constraints (e.g. not finalized, not a holiday
   * for the treatment type). Postpones by 7 days and re-checks until a valid date is found.
   * Add new constraint checks here when needed.
   * @param scheduledDate - Target date in YYYY-MM-DD format
   * @param treatmentType - Treatment type to check for holiday blocking
   * @param depth - Current recursion depth (internal use)
   * @returns The next available date that satisfies all scheduling constraints
   */
  async findNextSchedulableDate(
    scheduledDate: string,
    treatmentType: string,
    depth: number = 0,
  ): Promise<string> {
    const MAX_DEPTH = 52; // 1 year worth of weeks
    const MAX_DEPTH_WARNING = 10;

    if (depth >= MAX_DEPTH) {
      this.logger.error(
        `Schedulable-date resolution exceeded max depth (${MAX_DEPTH} weeks). Cannot find available date.`,
      );
      throw new BadRequestException(
        `Unable to schedule: too many consecutive blocked days (checked ${MAX_DEPTH} weeks ahead).`,
      );
    }

    if (depth >= MAX_DEPTH_WARNING) {
      this.logger.warn(
        `Schedulable-date resolution at depth ${depth}: many consecutive blocked days detected`,
      );
    }

    const [isFinalized, isBlockedByHoliday] = await Promise.all([
      this.dayFinalizationService.isDayFinalized(scheduledDate),
      this.holidayService.isHolidayForTreatment(scheduledDate, treatmentType),
    ]);

    if (!isFinalized && !isBlockedByHoliday) {
      return scheduledDate;
    }

    const reason =
      isFinalized && isBlockedByHoliday
        ? 'finalized and holiday'
        : isFinalized
          ? 'finalized'
          : 'holiday';
    const nextDateStr = addDaysToDateString(scheduledDate, 7);

    this.logger.log(
      `Date ${scheduledDate} blocked (${reason}), postponing to ${nextDateStr}`,
    );

    return this.findNextSchedulableDate(nextDateStr, treatmentType, depth + 1);
  }

  /**
   * Recompute the return consultation date for the episode that contains the given
   * treatment appointment. Reads the current max scheduled session date across ALL
   * treatment plans in the same consultation (the source of truth after all postpones
   * are committed), then moves the return assessment appointment if the computed date
   * differs from its current scheduled_date.
   *
   * This is the correct anchor for multi-treatment episodes: it avoids the per-call
   * "newDate" anchor used in bulkPostpone, which can cause ping-pong when multiple
   * treatment plans are moved to different dates in separate calls.
   */
  async recomputeReturnForEpisode(treatmentAppointmentId: number): Promise<{
    rescheduled: boolean;
    appointment_id?: number;
    patient_id?: number;
    patient_name?: string;
    old_date?: string;
    new_date?: string;
  }> {
    const treatmentId = await this.getTreatmentIdForAppointmentId(
      treatmentAppointmentId,
    );
    if (!treatmentId) return { rescheduled: false };

    const sessionInfo =
      await this.treatmentService.getSessionWithReturnConfig(treatmentId);
    if (!sessionInfo?.consultation_id) return { rescheduled: false };

    const { consultation_id, return_weeks, return_when_treatment_complete } =
      sessionInfo;

    const shouldReschedule =
      return_when_treatment_complete ||
      (return_weeks !== null && return_weeks > 0);
    if (!shouldReschedule) return { rescheduled: false };

    const treatmentIds =
      await this.treatmentService.getTreatmentIdsByConsultationId(
        consultation_id,
      );
    if (treatmentIds.length === 0) return { rescheduled: false };

    let maxSessionDate: string | null = null;
    for (const tid of treatmentIds) {
      const date =
        await this.sessionService.getMaxScheduledDateForTreatment(tid);
      if (date && (!maxSessionDate || date > maxSessionDate)) {
        maxSessionDate = date;
      }
    }
    if (!maxSessionDate) return { rescheduled: false };

    const returnWeeksValue = return_weeks ?? 0;
    const rawReturnDate =
      returnWeeksValue > 0
        ? addDaysToDateString(maxSessionDate, returnWeeksValue * 7)
        : maxSessionDate;
    const targetDate = await this.findNextSchedulableDate(
      rawReturnDate,
      AppointmentType.ASSESSMENT,
    );

    const returnAppointments =
      await this.findReturnAssessmentAppointmentsForTreatment(
        treatmentId,
        maxSessionDate,
      );
    if (returnAppointments.length === 0) return { rescheduled: false };

    const returnAtt = returnAppointments[0];
    if (returnAtt.scheduled_date === targetDate) return { rescheduled: false };

    const previousDate = returnAtt.scheduled_date;
    await this.postpone(returnAtt.id, targetDate);

    return {
      rescheduled: true,
      appointment_id: returnAtt.id,
      patient_id: returnAtt.patient_id,
      patient_name: returnAtt.patient?.name ?? 'Patient',
      old_date: previousDate,
      new_date: targetDate,
    };
  }

  /**
   * Find unresolved past appointments (dates before today)
   * Returns dates with counts of appointments that are not completed, cancelled, or missed
   */
  async findUnresolvedPastDates(): Promise<{
    hasUnresolved: boolean;
    dates: Array<{
      date: string;
      count: number;
      statuses: string[];
    }>;
  }> {
    const today = getCurrentDateString();

    const unresolvedAppointments = await this.appointmentRepository
      .createQueryBuilder('appointment')
      .select('appointment.scheduled_date', 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('ARRAY_AGG(DISTINCT appointment.status)', 'statuses')
      .where('appointment.scheduled_date < :today', { today })
      .andWhere('appointment.status NOT IN (:...resolvedStatuses)', {
        resolvedStatuses: [
          AppointmentStatus.COMPLETED,
          AppointmentStatus.CANCELLED,
          AppointmentStatus.MISSED,
        ],
      })
      .groupBy('appointment.scheduled_date')
      .orderBy('appointment.scheduled_date', 'ASC')
      .limit(10) // Safety limit to avoid performance issues
      .getRawMany();

    const dates = unresolvedAppointments.map((item) => ({
      date: item.date,
      count: parseInt(item.count, 10),
      statuses: item.statuses,
    }));

    return {
      hasUnresolved: dates.length > 0,
      dates,
    };
  }
}
