import {
  Injectable,
  Logger,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentType } from '../entities/treatment.entity';
import {
  CreateAttendanceDto,
  UpdateAttendanceDto,
  AttendanceResponseDto,
  RescheduleAttendancesDto,
  EligibleParentOptionDto,
  EligibleParentOptionsResponseDto,
} from '../dtos/attendance.dto';
import { ScheduleSetting } from '../entities/schedule-setting.entity';
import { AttendanceStatus, AttendanceType, PatientStatus } from '../common/enums';
import {
  ResourceNotFoundException,
  InvalidAttendanceStatusTransitionException,
  AttendanceTimeSlotUnavailableException,
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

/** Only these statuses are considered "open" and can be cancelled when patient goes to F/A. MISSED must never be cancelled. */
const OPEN_ATTENDANCE_STATUSES = [
  AttendanceStatus.SCHEDULED,
  AttendanceStatus.CHECKED_IN,
  AttendanceStatus.IN_PROGRESS,
] as const;

interface BulkPostponeSuccessItem {
  attendance_id: number;
  message: string;
  new_date: string;
}

interface BulkPostponeFailureItem {
  attendance_id: number;
  error: string;
}

interface AutoRescheduledReturnItem {
  attendance_id: number;
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
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
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

  async create(createAttendanceDto: CreateAttendanceDto): Promise<Attendance> {
    await this.validateScheduling(createAttendanceDto);
    const attendance = this.attendanceRepository.create(createAttendanceDto);

    // If creating as completed, set all required timestamps
    if (createAttendanceDto.status === AttendanceStatus.COMPLETED) {
      const currentDate = getCurrentDateString();
      const currentTime = getCurrentTimeString();

      attendance.checked_in_time = currentTime;
      attendance.started_time = currentTime;
      attendance.completed_time = currentTime;
    }

    return await this.attendanceRepository.save(attendance);
  }

  async findAll(): Promise<Attendance[]> {
    return await this.attendanceRepository.find({
      relations: ['patient'],
    });
  }

  async findByDate(date: string): Promise<Attendance[]> {
    // Date is already in YYYY-MM-DD string format, use directly
    return await this.attendanceRepository.find({
      where: {
        scheduled_date: date,
      },
      relations: ['patient'],
      order: {
        scheduled_time: 'ASC',
      },
    });
  }

  async findOne(id: number): Promise<Attendance> {
    const attendance = await this.attendanceRepository.findOne({
      where: { id },
      relations: ['patient'],
    });
    if (!attendance) {
      throw new ResourceNotFoundException('Attendance', id);
    }
    return attendance;
  }

  async findByPatientId(
    patientId: number,
    fromDate?: string,
    status?: AttendanceStatus,
  ): Promise<AttendanceResponseDto[]> {
    const queryBuilder = this.attendanceRepository
      .createQueryBuilder('attendance')
      .leftJoinAndSelect('attendance.patient', 'patient')
      .where('attendance.patient_id = :patientId', { patientId });

    // Apply date filter if provided
    if (fromDate) {
      queryBuilder.andWhere('attendance.scheduled_date >= :fromDate', {
        fromDate,
      });
    }

    // Apply status filter if provided
    if (status) {
      queryBuilder.andWhere('attendance.status = :status', { status });
    }

    queryBuilder
      .orderBy('attendance.scheduled_date', 'ASC')
      .addOrderBy('attendance.scheduled_time', 'ASC');

    const attendances = await queryBuilder.getMany();
    return attendances.map((attendance) =>
      this.transformToResponseDto(attendance),
    );
  }

  /**
   * Find all open (scheduled, checked_in, in_progress) attendances for a patient.
   * Used when changing patient status to Discharged (A) or Missed (F) to cancel them.
   */
  async findOpenAttendancesByPatientId(patientId: number): Promise<Attendance[]> {
    return this.attendanceRepository.find({
      where: {
        patient_id: patientId,
        status: In([...OPEN_ATTENDANCE_STATUSES]),
      },
      order: { scheduled_date: 'ASC', scheduled_time: 'ASC' },
    });
  }

  /**
   * Cancel attendances by IDs only if they are open (scheduled, checked_in, in_progress).
   * Does not cancel MISSED or COMPLETED. Used when cancelling a treatment session so linked
   * open attendances are cancelled via AttendanceService (single owner of attendance status).
   */
  async cancelOpenAttendancesByIds(
    attendanceIds: number[],
    cancellationReason?: string,
  ): Promise<Array<{ id: number; type: string; scheduled_date: string }>> {
    if (attendanceIds.length === 0) return [];
    const attendances = await this.attendanceRepository.find({
      where: { id: In(attendanceIds) },
    });
    const openStatusSet = new Set<string>(OPEN_ATTENDANCE_STATUSES);
    const toCancel = attendances.filter((a) => openStatusSet.has(a.status));
    const ids = toCancel.map((a) => a.id);

    if (ids.length === 0) return [];
    
    const result = await this.bulkCancel(ids, cancellationReason);
    const successIds = new Set(result.successes.map((s) => s.attendance_id));
    
    return toCancel
      .filter((a) => successIds.has(a.id))
      .map((a) => ({
        id: a.id,
        type: a.type,
        scheduled_date: a.scheduled_date,
      }));
  }

  /**
   * Cancel all open attendances for a patient (scheduled, checked_in, in_progress).
   * Returns the list of cancelled attendances (id, type, scheduled_date) for reporting.
   * Optionally exclude specific attendance IDs (e.g. the one just completed via consultation flow).
   */
  async cancelOpenAttendancesForPatient(
    patientId: number,
    cancellationReason: string,
    options?: { excludeAttendanceIds?: number[] },
  ): Promise<Array<{ id: number; type: string; scheduled_date: string }>> {
    const openAttendances =
      await this.findOpenAttendancesByPatientId(patientId);
    // Defensive: only cancel scheduled, checked_in, in_progress (never missed or completed)
    const openStatusSet = new Set<string>(OPEN_ATTENDANCE_STATUSES);
    let toCancel = openAttendances.filter((a) => openStatusSet.has(a.status));
    const excludeIds = new Set(options?.excludeAttendanceIds ?? []);
   
    if (excludeIds.size > 0) {
      toCancel = toCancel.filter((a) => !excludeIds.has(a.id));
    }
   
    const ids = toCancel.map((a) => a.id);
   
    if (ids.length === 0) {
      return [];
    }
   
    const result = await this.bulkCancel(ids, cancellationReason);
    const successIds = new Set(result.successes.map((s) => s.attendance_id));
   
    return toCancel
      .filter((a) => successIds.has(a.id))
      .map((a) => ({
        id: a.id,
        type: a.type,
        scheduled_date: a.scheduled_date,
      }));
  }

  /**
   * Returns eligible parent (root) attendances for linking a new assessment consultation.
   * Excludes roots whose chain has any attendance with patient_status 'A' (Discharged (A)) or 'F' (Missed (F)).
   */
  async findEligibleParentOptions(
    patientId: number,
  ): Promise<EligibleParentOptionsResponseDto> {
    const attendances = await this.attendanceRepository.find({
      where: { patient_id: patientId },
      relations: ['consultation'],
      order: { scheduled_date: 'ASC', scheduled_time: 'ASC' },
    });

    const finishedRootIds = new Set<number>();
    for (const att of attendances) {
      const status = att.consultation?.patient_status;
      if (status === 'A' || status === 'F') {
        const rootId = att.parent_attendance_id ?? att.id;
        finishedRootIds.add(rootId);
      }
    }

    const roots = attendances.filter(
      (a) =>
        a.type === AttendanceType.ASSESSMENT &&
        a.parent_attendance_id == null &&
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
   * parent_attendance_id is only valid for patients in treatment (T).
   * For A/F (new complaint) or N, the client must not send a parent; stale tabs are rejected here.
   * Also verifies the parent row is an assessment root for this patient and is still eligible (same rules as eligible-parent-options).
   */
  private async assertParentAttendanceAllowedForCreate(
    patientId: number,
    parentAttendanceId: number,
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

    const parentRow = await this.attendanceRepository.findOne({
      where: { id: parentAttendanceId },
    });
    if (!parentRow) {
      throw new BadRequestException(
        'First consultation not found.',
      );
    }
    if (parentRow.patient_id !== patientId) {
      throw new BadRequestException(
        'The selected first consultation does not belong to this patient.',
      );
    }
    if (parentRow.type !== AttendanceType.ASSESSMENT) {
      throw new BadRequestException(
        'The first consultation must be an assessment consultation.',
      );
    }
    if (parentRow.parent_attendance_id != null) {
      throw new BadRequestException(
        'The first consultation must be the root consultation for the complaint.',
      );
    }

    const eligible = await this.findEligibleParentOptions(patientId);
    const allowedIds = new Set(eligible.options.map((o) => o.id));
    if (!allowedIds.has(parentAttendanceId)) {
      throw new BadRequestException(
        'This first consultation is no longer available for new links (treatment closed). Refresh the page and choose another option.',
      );
    }
  }

  private transformToResponseDto(
    attendance: Attendance,
  ): AttendanceResponseDto {
    return {
      id: attendance.id,
      patient_id: attendance.patient_id,
      type: attendance.type,
      status: attendance.status,
      scheduled_date: attendance.scheduled_date,
      scheduled_time: attendance.scheduled_time,
      checked_in_time: attendance.checked_in_time,
      started_time: attendance.started_time,
      completed_time: attendance.completed_time,
      cancelled_date: attendance.cancelled_date,
      absence_justified: attendance.absence_justified,
      absence_notes: attendance.absence_notes,
      notes: attendance.notes,
      parent_attendance_id: attendance.parent_attendance_id,
      created_at: `${attendance.created_date}T${attendance.created_time}`,
      updated_at: `${attendance.updated_date}T${attendance.updated_time}`,
      patient: attendance.patient,
    };
  }

  async update(
    id: number,
    updateAttendanceDto: UpdateAttendanceDto,
  ): Promise<Attendance> {
    const attendance = await this.findOne(id);

    // Save the original status before any changes
    const originalStatus = attendance.status;

    if (updateAttendanceDto.status) {
      await this.validateStatusTransition(
        attendance.status,
        updateAttendanceDto.status,
      );
    }

    // Always update the updated_date and updated_time
    const updateData: any = {
      ...updateAttendanceDto,
      updated_date: getCurrentDateString(),
      updated_time: getCurrentTimeString(),
    };

    // If status is being changed and corresponding time fields aren't provided,
    // set them automatically (status changes happen on scheduled_date, so we only need time)
    if (
      updateAttendanceDto.status &&
      updateAttendanceDto.status !== attendance.status
    ) {
      const currentTime = getCurrentTimeString();

      switch (updateAttendanceDto.status) {
        case AttendanceStatus.CHECKED_IN:
          if (!updateData.checked_in_time)
            updateData.checked_in_time = currentTime;
          break;
        case AttendanceStatus.IN_PROGRESS:
          if (!updateData.started_time) updateData.started_time = currentTime;
          break;
        case AttendanceStatus.COMPLETED:
          if (!updateData.completed_time)
            updateData.completed_time = currentTime;
          break;
        case AttendanceStatus.CANCELLED:
          // Cancellation might happen on a different date
          if (!updateData.cancelled_date)
            updateData.cancelled_date = getCurrentDateString();
          break;
        // For SCHEDULED status, we don't set any specific timestamp
      }
    }

    this.attendanceRepository.merge(attendance, updateData);
    const updatedAttendance = await this.attendanceRepository.save(attendance);

    // Update patient's missing_appointments_streak based on status change
    // Only update for MISSED and COMPLETED statuses
    if (
      updateAttendanceDto.status &&
      updateAttendanceDto.status !== originalStatus &&
      (updateAttendanceDto.status === AttendanceStatus.MISSED ||
        updateAttendanceDto.status === AttendanceStatus.COMPLETED)
    ) {
      await this.updatePatientMissedStreak(
        updatedAttendance,
        updateAttendanceDto,
      );
    }

    // When physiotherapy/tens attendance is marked MISSED, sync linked sessions
    if (
      updateAttendanceDto.status === AttendanceStatus.MISSED &&
      originalStatus !== AttendanceStatus.MISSED &&
      (updatedAttendance.type === AttendanceType.PHYSIOTHERAPY ||
        updatedAttendance.type === AttendanceType.TENS)
    ) {
      const reason =
        updateAttendanceDto.absence_notes ||
        'Reason not provided at the time of registration';
      await this.sessionService.markSessionsAsMissedByAttendanceId(
        updatedAttendance.id,
        reason,
      );
    }

    // Check if this is a physiotherapy/tens attendance being completed
    if (
      updateAttendanceDto.status === AttendanceStatus.COMPLETED &&
      attendance.status !== AttendanceStatus.COMPLETED &&
      (attendance.type === 'physiotherapy' || attendance.type === 'tens')
    ) {
      await this.handlePhysiotherapyTensCompletion(updatedAttendance);
    }

    return updatedAttendance;
  }

  /**
   * Sync attendance status when a linked `hms_session` row is updated (session → attendance).
   * Updates only status and required timestamps; does NOT run side effects (streak, session
   * sync, handlePhysiotherapyTensCompletion) to avoid loops when the change originated from the session/consultation flow.
   */
  async syncStatusFromSession(
    attendanceId: number,
    status: AttendanceStatus,
    options?: { cancellationReason?: string },
  ): Promise<Attendance> {
    const attendance = await this.findOne(attendanceId);
    const currentTime = getCurrentTimeString();
    const currentDate = getCurrentDateString();

    const updateData: Partial<Attendance> = {
      status,
      updated_date: currentDate,
      updated_time: currentTime,
    };

    if (status === AttendanceStatus.COMPLETED && !attendance.completed_time) {
      updateData.completed_time = currentTime;
    }
    if (status === AttendanceStatus.CANCELLED) {
      updateData.cancelled_date = currentDate;
      updateData.cancelled_time = currentTime;
      updateData.absence_notes = options?.cancellationReason ?? null;
    }
    if (status === AttendanceStatus.MISSED && options?.cancellationReason) {
      updateData.absence_notes = options.cancellationReason;
    }

    this.attendanceRepository.merge(attendance, updateData);
    return await this.attendanceRepository.save(attendance);
  }

  /**
   * Cancel an attendance (soft delete: set status to CANCELLED).
   * Does not allow cancelling COMPLETED or MISSED attendances.
   */
  async cancel(id: number, cancellationReason?: string): Promise<void> {
    // Try to find the attendance first to check status
    const attendance = await this.attendanceRepository.findOne({
      where: { id },
      relations: ['patient'],
    });

    if (!attendance) {
      throw new ResourceNotFoundException('Attendance', id);
    }

    if (attendance.status === AttendanceStatus.COMPLETED) {
      throw new InvalidAttendanceStatusTransitionException(
        id,
        attendance.status,
        'CANCELLED',
      );
    }

    // Do not overwrite MISSED with CANCELLED (e.g. end-of-day: keep today's missed as missed, only cancel future open ones)
    if (attendance.status === AttendanceStatus.MISSED) {
      throw new InvalidAttendanceStatusTransitionException(
        id,
        attendance.status,
        AttendanceStatus.CANCELLED,
      );
    }

    attendance.status = AttendanceStatus.CANCELLED;
    attendance.cancelled_date = new Date().toISOString().split('T')[0];
    attendance.cancelled_time = new Date()
      .toTimeString()
      .split(' ')[0]
      .substring(0, 8);
    attendance.absence_justified = cancellationReason ? true : false;
    attendance.absence_notes = cancellationReason || 'Unjustified';

    await this.attendanceRepository.save(attendance);

    // Keep treatment sessions in sync: mark linked sessions as cancelled
    if (
      attendance.type === AttendanceType.PHYSIOTHERAPY ||
      attendance.type === AttendanceType.TENS
    ) {
      await this.sessionService.cancelSessionsByAttendanceId(
        attendance.id,
      );
    }
  }

  async updateAbsenceJustifications(
    absenceJustifications: Array<{
      attendanceId: number;
      justified: boolean;
      justification?: string;
    }>,
  ): Promise<void> {
    for (const absence of absenceJustifications) {
      const attendance = await this.attendanceRepository.findOne({
        where: { id: absence.attendanceId },
      });

      if (attendance) {
        attendance.status = AttendanceStatus.CANCELLED;
        attendance.cancelled_date = new Date().toISOString().split('T')[0];
        attendance.cancelled_time = new Date()
          .toTimeString()
          .split(' ')[0]
          .substring(0, 8);
        attendance.absence_justified = absence.justified;
        attendance.absence_notes = absence.justification || null;

        await this.attendanceRepository.save(attendance);

        if (
          attendance.type === AttendanceType.PHYSIOTHERAPY ||
          attendance.type === AttendanceType.TENS
        ) {
          await this.sessionService.cancelSessionsByAttendanceId(
            attendance.id,
          );
        }
      }
    }
  }

  /**
   * Treatment signature from linked session rows (body location, color for physiotherapy).
   */
  async getTreatmentSignatureForAttendanceId(
    attendanceId: number,
  ): Promise<TreatmentSchedulingSignature | null> {
    const sessions =
      await this.sessionService.getSessionsByAttendance(attendanceId);
    const first = sessions.find((s) => s.body_location?.trim());
    if (!first?.body_location) {
      return null;
    }
    return {
      bodyLocation: first.body_location,
      color: first.color ?? undefined,
    };
  }

  /**
   * BR-306: true when an open attendance on the same date already covers this signature.
   */
  async hasConflictingOpenTreatmentAttendance(
    patientId: number,
    scheduledDate: string,
    type: AttendanceType.PHYSIOTHERAPY | AttendanceType.TENS,
    signature: TreatmentSchedulingSignature,
    excludeAttendanceIds: number[] = [],
  ): Promise<boolean> {
    const exclude = new Set(excludeAttendanceIds);
    const openOnDate = await this.attendanceRepository.find({
      where: {
        patient_id: patientId,
        scheduled_date: scheduledDate,
        type,
        status: In([...OPEN_ATTENDANCE_STATUSES]),
      },
      select: ['id'],
    });

    for (const row of openOnDate) {
      if (exclude.has(row.id)) {
        continue;
      }
      const otherSig = await this.getTreatmentSignatureForAttendanceId(row.id);
      if (otherSig && treatmentSignaturesConflict(type, signature, otherSig)) {
        return true;
      }
    }
    return false;
  }

  private throwTreatmentSchedulingConflict(
    type: AttendanceType.PHYSIOTHERAPY | AttendanceType.TENS,
  ): never {
    const detail =
      type === AttendanceType.PHYSIOTHERAPY
        ? 'body location and color'
        : 'body location';
    throw new BadRequestException(
      `This patient already has a ${type === AttendanceType.PHYSIOTHERAPY ? 'physiotherapy' : 'TENS'} attendance scheduled for this date with the same ${detail}.`,
    );
  }

  async assertNoTreatmentSchedulingConflict(
    patientId: number,
    scheduledDate: string,
    type: AttendanceType.PHYSIOTHERAPY | AttendanceType.TENS,
    signature: TreatmentSchedulingSignature,
    excludeAttendanceIds: number[] = [],
  ): Promise<void> {
    const hasConflict = await this.hasConflictingOpenTreatmentAttendance(
      patientId,
      scheduledDate,
      type,
      signature,
      excludeAttendanceIds,
    );
    if (hasConflict) {
      this.throwTreatmentSchedulingConflict(type);
    }
  }

  private async validateScheduling(
    dto: CreateAttendanceDto,
    options?: {
      skipCompletedRootAssessmentCheck?: boolean;
      treatmentSignature?: TreatmentSchedulingSignature;
      excludeAttendanceIds?: number[];
    },
  ): Promise<void> {
    if (dto.parent_attendance_id != null) {
      await this.assertParentAttendanceAllowedForCreate(
        dto.patient_id,
        dto.parent_attendance_id,
      );
    }

    // Assessment without parent: rules by patient_status — open root first, then T vs N vs A/F.
    // Skip entire block when rescheduling (skipCompletedRootAssessmentCheck).
    const skipRootCheck = options?.skipCompletedRootAssessmentCheck === true;
    const parentId = dto.parent_attendance_id;
    if (
      !skipRootCheck &&
      (parentId === undefined || parentId === null) &&
      dto.type === AttendanceType.ASSESSMENT
    ) {
      const patient = await this.patientRepository.findOne({
        where: { id: dto.patient_id },
        select: ['id', 'patient_status'],
      });
      const allowNewRootAssessmentWithoutParent =
        patient?.patient_status === PatientStatus.DISCHARGED ||
        patient?.patient_status === PatientStatus.ABSENT;
      
      const inTreatment =
        patient?.patient_status === PatientStatus.IN_TREATMENT;

      // No more than one open root assessment (parent null) at a time (N, T, A/F).
      const openRoot = await this.attendanceRepository.findOne({
        where: {
          patient_id: dto.patient_id,
          type: AttendanceType.ASSESSMENT,
          parent_attendance_id: IsNull(),
          status: In(OPEN_ATTENDANCE_STATUSES),
        },
        relations: ['patient'],
        order: { scheduled_date: 'ASC' },
      });
      if (openRoot) {
        const patient_name = openRoot.patient?.name ?? "";
        const scheduled_date = formatDisplayDate(openRoot.scheduled_date);
        throw new BadRequestException(
            `The patient ${patient_name + " "}has not yet completed the first consultation scheduled for ${scheduled_date}. Complete this consultation before scheduling a new one.`,
        );
      }

      // In treatment (T): always link to the main complaint (never schedule a root assessment without a parent).
      if (inTreatment) {
        throw new BadRequestException(
          'Select the main complaint (previous consultation) related to this appointment. If the list does not appear, refresh the page and try again.',
        );
      }

      // New patient (N) or unknown status: block "first attendance" if any completed root exists.
      // A/F: skip — "New complaint" is allowed when there is no open root (checked above).
      if (!allowNewRootAssessmentWithoutParent) {
        const completedRootCount = await this.attendanceRepository.count({
          where: {
            patient_id: dto.patient_id,
            type: AttendanceType.ASSESSMENT,
            status: AttendanceStatus.COMPLETED,
            parent_attendance_id: IsNull(),
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
    const finalization = await this.dayFinalizationService.getFinalizationStatus(
      dto.scheduled_date,
    );
    if (finalization) {
      throw new BadRequestException(
        'Day already finalized. It is no longer possible to schedule attendances for this day.',
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
        tens: 'TENS'
      };
      const treatmentName = treatmentTypeNames[dto.type as keyof typeof treatmentTypeNames] || dto.type;
      throw new BadRequestException(
        `This date is a holiday and it is not possible to schedule ${treatmentName}.`,
      );
    }

    // BR-306: assessment — at most one open per patient per day
    if (dto.type === AttendanceType.ASSESSMENT) {
      const existingAssessment = await this.attendanceRepository.count({
        where: {
          patient_id: dto.patient_id,
          scheduled_date: dto.scheduled_date,
          type: AttendanceType.ASSESSMENT,
          status: In(OPEN_ATTENDANCE_STATUSES),
          ...(options?.excludeAttendanceIds?.length
            ? { id: Not(In(options.excludeAttendanceIds)) }
            : {}),
        },
      });
      if (existingAssessment > 0) {
        throw new BadRequestException(
          'This patient already has a consultation scheduled for this date. Check the attendance list.',
        );
      }
    }

    // BR-306: physiotherapy / tens — used on reschedule (signature from linked sessions)
    if (
      (dto.type === AttendanceType.PHYSIOTHERAPY ||
        dto.type === AttendanceType.TENS) &&
      options?.treatmentSignature
    ) {
      await this.assertNoTreatmentSchedulingConflict(
        dto.patient_id,
        dto.scheduled_date,
        dto.type,
        options.treatmentSignature,
        options?.excludeAttendanceIds ?? [],
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
      throw new AttendanceTimeSlotUnavailableException(
        dto.scheduled_date,
        dto.scheduled_time,
        dto.type,
      );
    }

    // Check concurrent appointments using string date
    const concurrent = await this.attendanceRepository.count({
      where: {
        scheduled_date: dto.scheduled_date,
        scheduled_time: dto.scheduled_time,
        type: dto.type,
        status: AttendanceStatus.SCHEDULED,
      },
    });

    const maxConcurrent =
      dto.type === 'assessment'
        ? setting.max_concurrent_assessment
        : setting.max_concurrent_physiotherapy_tens;

    if (concurrent >= maxConcurrent) {
      throw new AttendanceTimeSlotUnavailableException(
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
      originalAttendanceId?: number;
      scheduledTime?: string;
    } = {},
  ): Promise<boolean> {
    const { patientId, originalAttendanceId, scheduledTime = '09:00:00' } =
      options;

    const finalization = await this.dayFinalizationService.getFinalizationStatus(
      date,
    );
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
    const concurrent = await this.attendanceRepository.count({
      where: {
        scheduled_date: date,
        scheduled_time: timeForSlot,
        type: type as AttendanceType,
        status: AttendanceStatus.SCHEDULED,
      },
    });
    const maxConcurrent =
      type === AttendanceType.ASSESSMENT
        ? setting.max_concurrent_assessment
        : setting.max_concurrent_physiotherapy_tens;
    if (concurrent >= maxConcurrent) return false;

    const attendances = await this.findByDate(date);
    if (originalAttendanceId != null) {
      const hasReschedule = attendances.some(
        (a) => a.rescheduled_from_attendance_id === originalAttendanceId,
      );
      if (hasReschedule) return false;
    }
    if (type === AttendanceType.ASSESSMENT && patientId != null) {
      const hasOtherAssessment = attendances.some(
        (a) =>
          a.patient_id === patientId &&
          a.type === AttendanceType.ASSESSMENT &&
          a.status === AttendanceStatus.SCHEDULED &&
          a.id !== originalAttendanceId,
      );
      if (hasOtherAssessment) return false;
    }

    // BR-306: physiotherapy / tens — same location (+ color) on same day
    if (
      (type === AttendanceType.PHYSIOTHERAPY || type === AttendanceType.TENS) &&
      patientId != null &&
      originalAttendanceId != null
    ) {
      const signature =
        await this.getTreatmentSignatureForAttendanceId(originalAttendanceId);
      if (signature) {
        const hasConflict = await this.hasConflictingOpenTreatmentAttendance(
          patientId,
          date,
          type as AttendanceType.PHYSIOTHERAPY | AttendanceType.TENS,
          signature,
          [originalAttendanceId],
        );
        if (hasConflict) return false;
      }
    }

    return true;
  }

  /**
   * Get next available date for an attendance (same weekday): assessment or treatment logic.
   * Used by manage-attendance modal preview and by end-of-day reschedule.
   */
  async getNextAvailableDateForAttendance(
    attendanceId: number,
  ): Promise<string | null> {
    const attendance = await this.findOne(attendanceId);
    const fromDate = attendance.scheduled_date ?? addDaysToDateString(getCurrentDateString(), 7);
    const scheduledTime = attendance.scheduled_time ?? undefined;

    if (attendance.type === AttendanceType.ASSESSMENT) {
      return this.getNextAvailableDateForAssessment(
        attendance.patient_id,
        fromDate,
        attendanceId,
        scheduledTime,
      );
    }

    const treatmentId = await this.getTreatmentIdForAttendance(
      attendance,
    );
    return this.getNextAvailableDateForTreatment(
      attendance.type,
      attendance.patient_id,
      fromDate,
      attendanceId,
      treatmentId,
      scheduledTime,
    );
  }

  /**
   * Get next available date for assessment attendance (same weekday, next week).
   */
  private async getNextAvailableDateForAssessment(
    patientId: number,
    fromDate: string,
    originalAttendanceId: number,
    scheduledTime?: string,
  ): Promise<string | null> {
    let candidate = addDaysToDateString(fromDate, 7);
    const maxWeeks = 52;

    for (let week = 0; week < maxWeeks; week++) {
      const valid = await this.isDateAvailableForScheduling(
        candidate,
        'assessment',
        { patientId, originalAttendanceId, scheduledTime },
      );
      if (valid) return candidate;
      candidate = addDaysToDateString(candidate, 7);
    }

    return null;
  }

  /**
   * Get treatment id for a physiotherapy/tens attendance (from session rows or by patient+type).
   * Public for use by EndOfDayProcessService (return assessment reschedule).
   */
  async getTreatmentIdForAttendanceId(
    attendanceId: number,
  ): Promise<number | null> {
    const attendance = await this.findOne(attendanceId);
    return this.getTreatmentIdForAttendance(attendance);
  }

  /**
   * Get treatment id for a physiotherapy/tens attendance (from session rows or by patient+type).
   */
  private async getTreatmentIdForAttendance(
    attendance: Attendance,
  ): Promise<number | null> {
    const linkedSessions =
      await this.sessionService.getSessionsByAttendance(
        attendance.id,
      );
    if (linkedSessions.length > 0 && linkedSessions[0].treatment_id) {
      return linkedSessions[0].treatment_id;
    }
    const sessions =
      await this.treatmentService.getTreatmentsByPatient(
        attendance.patient_id,
      );
    const match = sessions.find(
      (s) =>
        ((s.treatment_type === TreatmentType.PHYSIOTHERAPY &&
          attendance.type === AttendanceType.PHYSIOTHERAPY) ||
          (s.treatment_type === TreatmentType.TENS &&
            attendance.type === AttendanceType.TENS)) &&
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
    originalAttendanceId: number,
    treatmentId: number | null,
    scheduledTime?: string,
  ): Promise<string | null> {
    let candidate = addDaysToDateString(fromDate, 7);
    if (treatmentId) {
      const lastDate =
        await this.sessionService.getMaxScheduledDateForTreatment(
          treatmentId,
        );
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
        originalAttendanceId,
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
      [AttendanceStatus.SCHEDULED]: [
        AttendanceStatus.CHECKED_IN,
        AttendanceStatus.CANCELLED,
        AttendanceStatus.MISSED,
      ],
      [AttendanceStatus.CHECKED_IN]: [
        AttendanceStatus.SCHEDULED,
        AttendanceStatus.IN_PROGRESS,
        AttendanceStatus.COMPLETED,
        AttendanceStatus.CANCELLED,
      ],
      [AttendanceStatus.IN_PROGRESS]: [
        AttendanceStatus.CHECKED_IN,
        AttendanceStatus.COMPLETED,
        AttendanceStatus.CANCELLED,
      ],
      [AttendanceStatus.COMPLETED]: [
        // Completed attendances cannot be moved to any other status
      ],
      [AttendanceStatus.CANCELLED]: [AttendanceStatus.SCHEDULED],
      [AttendanceStatus.MISSED]: [
        AttendanceStatus.MISSED, // Allow updating missed attendance (e.g., to update absence notes)
        AttendanceStatus.SCHEDULED, // Allow rescheduling missed appointments
      ],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new InvalidAttendanceStatusTransitionException(
        0, // We don't have attendance ID here, it will be filled by the service
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

  // Get all attendances with minimal data for schedule view
  async findAllForSchedule(filters?: {
    statuses?: AttendanceStatus[];
    type?: string;
    limit?: number;
    fromDate?: string;
    toDate?: string;
  }): Promise<any[]> {
    const query = this.attendanceRepository
      .createQueryBuilder('attendance')
      .select([
        'attendance.id',
        'attendance.patient_id',
        'attendance.type',
        'attendance.status',
        'attendance.scheduled_date',
        'attendance.notes',
        'patient.name',
        'patient.priority',
      ])
      .leftJoin('attendance.patient', 'patient');

    if (filters?.statuses?.length) {
      query.andWhere('attendance.status IN (:...statuses)', {
        statuses: filters.statuses,
      });
    }

    if (filters?.type) {
      query.andWhere('attendance.type = :type', { type: filters.type });
    }

    if (filters?.fromDate && filters?.toDate) {
      const { fromDate, toDate } = this.clampScheduleDateRange(
        filters.fromDate,
        filters.toDate,
      );
      query.andWhere('attendance.scheduled_date >= :fromDate', { fromDate });
      query.andWhere('attendance.scheduled_date <= :toDate', { toDate });
    }

    query
      .orderBy('attendance.scheduled_date', 'ASC')
      .addOrderBy('attendance.scheduled_time', 'ASC');

    if (filters?.limit && filters.limit > 0) {
      query.limit(filters.limit);
    }

    return await query.getRawMany();
  }

  // Get the next scheduled attendance date
  async findNextScheduledDate(): Promise<string | null> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Set to start of day

      const nextAttendance = await this.attendanceRepository
        .createQueryBuilder('attendance')
        .select('attendance.scheduled_date')
        .where('attendance.scheduled_date >= :today', { today })
        .andWhere('attendance.status != :cancelled', {
          cancelled: AttendanceStatus.CANCELLED,
        })
        .orderBy('attendance.scheduled_date', 'ASC')
        .getOne();

      if (nextAttendance && nextAttendance.scheduled_date) {
        // scheduled_date is now always a string in YYYY-MM-DD format
        return nextAttendance.scheduled_date;
      }

      return null;
    } catch (error) {
      console.error('Error finding next scheduled date:', error);
      throw error;
    }
  }

  // Get attendance statistics for a specific date
  async getAttendanceStats(date: string): Promise<{
    total: number;
    scheduled: number;
    checked_in: number;
    in_progress: number;
    completed: number;
    cancelled: number;
    by_type: { assessment: number; physiotherapy: number; tens: number };
  }> {
    // Use date string directly since scheduled_date is now a string
    const attendances = await this.attendanceRepository.find({
      where: { scheduled_date: date },
    });

    const stats = {
      total: attendances.length,
      scheduled: 0,
      checked_in: 0,
      in_progress: 0,
      completed: 0,
      cancelled: 0,
      by_type: { assessment: 0, physiotherapy: 0, tens: 0 },
    };

    attendances.forEach((attendance) => {
      // Count by status
      switch (attendance.status) {
        case AttendanceStatus.SCHEDULED:
          stats.scheduled++;
          break;
        case AttendanceStatus.CHECKED_IN:
          stats.checked_in++;
          break;
        case AttendanceStatus.IN_PROGRESS:
          stats.in_progress++;
          break;
        case AttendanceStatus.COMPLETED:
          stats.completed++;
          break;
        case AttendanceStatus.CANCELLED:
          stats.cancelled++;
          break;
      }

      // Count by type
      if (attendance.type === 'assessment') {
        stats.by_type.assessment++;
      } else if (attendance.type === 'physiotherapy') {
        stats.by_type.physiotherapy++;
      } else if (attendance.type === 'tens') {
        stats.by_type.tens++;
      }
    });

    return stats;
  }

  /**
   * Update patient's missing_appointments_streak based on attendance status change
   */
  private async updatePatientMissedStreak(
    attendance: Attendance,
    updateDto: UpdateAttendanceDto,
  ): Promise<void> {
    const patient = await this.patientRepository.findOne({
      where: { id: attendance.patient_id },
    });

    if (!patient) {
      console.error(
        `Patient ${attendance.patient_id} not found when updating missed streak`,
      );
      return;
    }

    // If attendance is COMPLETED, reset the streak
    if (updateDto.status === AttendanceStatus.COMPLETED) {
      patient.missing_appointments_streak = 0;
      await this.patientRepository.save(patient);
      return;
    }

    if (updateDto.status !== AttendanceStatus.MISSED) {
      return;
    }

    const scheduledDate = attendance.scheduled_date;
    if (!scheduledDate) {
      return;
    }

    // If the patient completed any attendance on this same day,
    // we don't consider it as a "missed day" for streak purposes.
    const completedSameDayCount = await this.attendanceRepository.count({
      where: {
        patient_id: attendance.patient_id,
        scheduled_date: scheduledDate,
        status: AttendanceStatus.COMPLETED,
      },
    });
    if (completedSameDayCount > 0) {
      return;
    }

    // If attendance is marked as MISSED
    if (updateDto.absence_justified === false) {
      // Dedupe by patient + scheduled_date: only increment once per day,
      // even if the patient missed multiple attendances that day.
      const otherUnjustifiedMissedSameDayCount =
        await this.attendanceRepository.count({
          where: {
            patient_id: attendance.patient_id,
            scheduled_date: scheduledDate,
            status: AttendanceStatus.MISSED,
            absence_justified: false,
            id: Not(attendance.id),
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
      // This avoids a "justified" missed attendance wiping out a day that also
      // has an unjustified miss.
      const anyUnjustifiedMissedSameDayCount =
        await this.attendanceRepository.count({
          where: {
            patient_id: attendance.patient_id,
            scheduled_date: scheduledDate,
            status: AttendanceStatus.MISSED,
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
   * Handle completion of physiotherapy/tens attendances by creating treatment sessions
   */
  private async handlePhysiotherapyTensCompletion(
    attendance: Attendance,
  ): Promise<void> {
    try {
      // Look for existing treatment sessions for this patient and treatment type
      const existingSession =
        await this.sessionService.findActiveSessionForPatient(
          attendance.patient_id,
          attendance.type,
        );

      if (existingSession) {
        // Create a new session for this completed attendance
        await this.sessionService.createSessionFromAttendance(
          existingSession.id,
          attendance,
        );
      } else {
        // Log that no active treatment session was found
        console.warn(
          `No active treatment session found for patient ${attendance.patient_id} ` +
          `and type ${attendance.type}. Attendance ${attendance.id} completed but no session created.`,
        );
      }
    } catch (error) {
      // Log error but don't fail the attendance completion
      console.error(
        `Error creating treatment session for attendance ${attendance.id}:`,
        error,
      );
    }
  }

  /**
   * Postpone an attendance to a specific date
   * Updates the scheduled_date and tracks the postponement in notes
   * @param id - Attendance ID
   * @param newDate - New scheduled date in YYYY-MM-DD format
   */
  async postpone(id: number, newDate: string): Promise<Attendance> {
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
      throw new Error('Date must be in YYYY-MM-DD format');
    }

    const newDateObj = new Date(newDate + 'T00:00:00');

    // Find the attendance
    const attendance = await this.findOne(id);
    const originalDate = attendance.scheduled_date;
    const originalDateObj = new Date(originalDate + 'T00:00:00');

    // Block postponing to a finalized day
    const finalization = await this.dayFinalizationService.getFinalizationStatus(newDate);
    if (finalization) {
      throw new BadRequestException(
        'Day finalized. It is no longer possible to schedule attendances for this day.',
      );
    }

    // Check if new date is a holiday that blocks this treatment type
    const isBlockedByHoliday = await this.holidayService.isHolidayForTreatment(
      newDate,
      attendance.type,
    );
    if (isBlockedByHoliday) {
      const treatmentTypeNames = {
        assessment: 'Assessment consultations',
        physiotherapy: 'Physiotherapy',
        tens: 'TENS'
      };
      const treatmentName = treatmentTypeNames[attendance.type as keyof typeof treatmentTypeNames] || attendance.type;
      throw new BadRequestException(
        `The day ${newDate} is a holiday for ${treatmentName}.`,
      );
    }

    if (
      attendance.type === AttendanceType.PHYSIOTHERAPY ||
      attendance.type === AttendanceType.TENS
    ) {
      const signature = await this.getTreatmentSignatureForAttendanceId(id);
      if (signature) {
        await this.assertNoTreatmentSchedulingConflict(
          attendance.patient_id,
          newDate,
          attendance.type,
          signature,
          [id],
        );
      }
    } else {
      const existingAssessment = await this.attendanceRepository.count({
        where: {
          patient_id: attendance.patient_id,
          scheduled_date: newDate,
          type: AttendanceType.ASSESSMENT,
          status: In(OPEN_ATTENDANCE_STATUSES),
          id: Not(id),
        },
      });
      if (existingAssessment > 0) {
        throw new BadRequestException(
          'This patient already has a consultation scheduled for this date. Check the attendance list.',
        );
      }
    }

    // Check for conflicts at the new date/time
    const concurrent = await this.attendanceRepository.count({
      where: {
        scheduled_date: newDate,
        scheduled_time: attendance.scheduled_time,
        type: attendance.type,
        status: AttendanceStatus.SCHEDULED,
      },
    });

    // Get schedule settings to check max concurrent
    const dayOfWeek = newDateObj.getDay();
    const setting = await this.scheduleSettingRepository.findOne({
      where: {
        day_of_week: dayOfWeek,
        is_active: true
      },
    });

    if (!setting) {
      throw new Error(`Attendances are not available on ${getDayOfTheWeekName(dayOfWeek)}s.`);
    }

    const maxConcurrent =
      attendance.type === 'assessment'
        ? setting.max_concurrent_assessment
        : setting.max_concurrent_physiotherapy_tens;

    if (concurrent >= maxConcurrent) {
      throw new AttendanceTimeSlotUnavailableException(
        newDate,
        attendance.scheduled_time,
        attendance.type,
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
    if (attendance.notes) {
      updatedNotes = `${attendance.notes}\n${postponementNote}`;
    }

    // Update the attendance
    attendance.scheduled_date = newDate;
    attendance.notes = updatedNotes;

    const savedAttendance = await this.attendanceRepository.save(attendance);

    // For physiotherapy and tens treatments, also update any linked sessions
    if (attendance.type === 'physiotherapy' || attendance.type === 'tens') {
      const sessionRows = await this.sessionService.getSessionsByAttendance(attendance.id);
      
      for (const sessionRow of sessionRows) {
        // Only update if the session is still scheduled (not completed/missed/cancelled)
        if (sessionRow.status === 'scheduled') {
          await this.sessionService.rescheduleSession(sessionRow.id, newDate);
        }
      }
    }

    return savedAttendance;
  }

  /**
   * Reschedule cancelled or missed attendances to a new date.
   * Creates new attendance(s) with same params and links via rescheduled_from_attendance_id.
   * For physiotherapy/tens, creates new sessions with same treatment_id and session_number.
   */
  async reschedule(
    dto: RescheduleAttendancesDto,
    options?: { allowFirstAssessmentForNonTreatment?: boolean },
  ): Promise<AttendanceResponseDto[]> {
    const { attendance_ids: attendanceIdsRaw, new_scheduled_date: newDate } = dto;

    if (attendanceIdsRaw.length === 0) {
      throw new BadRequestException('attendance_ids cannot be empty.');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(newDate)) {
      throw new BadRequestException('New date must be in YYYY-MM-DD format.');
    }

    const attendanceIds = [...new Set(attendanceIdsRaw)];

    const attendances = await this.attendanceRepository.find({
      where: { id: In(attendanceIds) },
      relations: ['patient'],
    });

    if (attendances.length !== attendanceIds.length) {
      const foundIds = new Set(attendances.map((a) => a.id));
      const missing = attendanceIds.filter((id) => !foundIds.has(id));
      throw new ResourceNotFoundException(
        'Attendance',
        missing.join(', '),
      );
    }

    const allowedStatuses = [AttendanceStatus.CANCELLED, AttendanceStatus.MISSED];
    const invalid = attendances.filter((a) => !allowedStatuses.includes(a.status));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Only cancelled or missed attendances can be rescheduled. Invalid IDs: ${invalid.map((a) => a.id).join(', ')}`,
      );
    }

    const patient = attendances[0].patient;
    const isAllowedBypass =
      options?.allowFirstAssessmentForNonTreatment === true &&
      attendances.every(
        (a) => a.type === AttendanceType.ASSESSMENT && a.parent_attendance_id == null,
      );
    if (patient.patient_status !== PatientStatus.IN_TREATMENT && !isAllowedBypass) {
      throw new BadRequestException(
        'Patient is not in treatment. Only patients in treatment can reschedule attendances.',
      );
    }

    const alreadyRescheduled = await this.attendanceRepository.find({
      where: { rescheduled_from_attendance_id: In(attendanceIds) },
      select: ['rescheduled_from_attendance_id', 'scheduled_date'],
    });
    if (alreadyRescheduled.length > 0) {
      const existingDate = formatDisplayDate(
        toDateStringOnly(alreadyRescheduled[0].scheduled_date),
      );
      throw new BadRequestException(
        `This attendance has already been rescheduled for ${existingDate}`,
      );
    }

    const timeToCount = new Map<string, { type: AttendanceType; count: number }>();
    for (const a of attendances) {
      const key = `${a.type}:${a.scheduled_time}`;
      const current = timeToCount.get(key) || { type: a.type, count: 0 };
      current.count += 1;
      timeToCount.set(key, current);
    }

    const batchExcludeIds = attendances.map((a) => a.id);

    for (const original of attendances) {
      const scheduledTime =
        original.scheduled_time?.length === 8
          ? original.scheduled_time.substring(0, 5)
          : original.scheduled_time || '09:00';
      const validateDto: CreateAttendanceDto = {
        patient_id: original.patient_id,
        type: original.type,
        scheduled_date: newDate,
        scheduled_time: scheduledTime,
      };
      const treatmentSignature =
        original.type === AttendanceType.PHYSIOTHERAPY ||
        original.type === AttendanceType.TENS
          ? await this.getTreatmentSignatureForAttendanceId(original.id)
          : null;
      await this.validateScheduling(validateDto, {
        skipCompletedRootAssessmentCheck: true,
        treatmentSignature: treatmentSignature ?? undefined,
        excludeAttendanceIds: batchExcludeIds,
      });
    }

    for (const [, { type, count }] of timeToCount) {
      const originalWithType = attendances.find((a) => a.type === type);
      const timeForSlot = originalWithType?.scheduled_time ?? '09:00:00';
      const concurrent = await this.attendanceRepository.count({
        where: {
          scheduled_date: newDate,
          scheduled_time: timeForSlot,
          type,
          status: AttendanceStatus.SCHEDULED,
        },
      });
      const [year, month, day] = newDate.split('-').map(Number);
      const dayOfWeek = new Date(year, month - 1, day).getDay();
      const setting = await this.scheduleSettingRepository.findOne({
        where: { day_of_week: dayOfWeek, is_active: true },
      });
      if (!setting) continue;
      const maxConcurrent =
        type === AttendanceType.ASSESSMENT
          ? setting.max_concurrent_assessment
          : setting.max_concurrent_physiotherapy_tens;
      if (concurrent + count > maxConcurrent) {
        throw new AttendanceTimeSlotUnavailableException(
          newDate,
          timeForSlot,
          type,
        );
      }
    }

    const created: Attendance[] = [];
    for (const original of attendances) {
      const newAttendance = this.attendanceRepository.create({
        patient_id: original.patient_id,
        type: original.type,
        status: AttendanceStatus.SCHEDULED,
        scheduled_date: newDate,
        scheduled_time: original.scheduled_time || '09:00:00',
        notes: original.notes ?? undefined,
        parent_attendance_id: original.parent_attendance_id ?? undefined,
        rescheduled_from_attendance_id: original.id,
      });
      const saved = await this.attendanceRepository.save(newAttendance);
      created.push(saved);

      if (original.type === 'physiotherapy' || original.type === 'tens') {
        const sessionRows =
          await this.sessionService.getSessionsForReschedule(
            original.id,
            original.patient_id,
            original.type,
            original.scheduled_date,
          );
        for (const rec of sessionRows) {
          await this.sessionService.createSession({
            treatment_id: rec.treatment_id,
            attendance_id: saved.id,
            session_number: rec.session_number,
            scheduled_date: newDate,
          });
        }
      }
    }

    return created.map((a) => this.transformToResponseDto(a));
  }

  /**
   * Bulk cancel multiple attendances in a single transaction
   */
  async bulkCancel(
    attendanceIds: number[],
    cancellationReason?: string,
  ): Promise<{
    success_count: number;
    failure_count: number;
    successes: Array<{ attendance_id: number; message: string }>;
    failures: Array<{ attendance_id: number; error: string }>;
  }> {
    const results = {
      success_count: 0,
      failure_count: 0,
      successes: [] as Array<{ attendance_id: number; message: string }>,
      failures: [] as Array<{ attendance_id: number; error: string }>,
    };

    // Process each attendance in a transaction
    for (const id of attendanceIds) {
      try {
        await this.cancel(id, cancellationReason);
        results.success_count++;
        results.successes.push({
          attendance_id: id,
          message: 'Successfully cancelled',
        });
      } catch (error) {
        results.failure_count++;
        results.failures.push({
          attendance_id: id,
          error: error.message || 'Unknown error occurred',
        });
      }
    }

    return results;
  }

  /**
   * Bulk postpone multiple attendances to a specific date
   * @param attendanceIds - Array of attendance IDs to postpone
   * @param newDate - New scheduled date in YYYY-MM-DD format for all attendances
   */
  async bulkPostpone(
    attendanceIds: number[],
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

    // Process each attendance
    for (const id of attendanceIds) {
      try {
        const attendance = await this.findOne(id);
        const isTreatment =
          attendance.type === AttendanceType.PHYSIOTHERAPY ||
          attendance.type === AttendanceType.TENS;
        const returnRescheduleContext =
          await this.prepareReturnRescheduleContextForAttendance(
            attendance,
            rescheduleReturnAssessment,
            isTreatment,
          );

        const postponedAttendance = await this.postpone(id, newDate);
        results.success_count++;
        results.successes.push({
          attendance_id: id,
          message: 'Successfully postponed',
          new_date: postponedAttendance.scheduled_date,
        });

        await this.collectReturnAssessmentRescheduleCandidates(
          returnRescheduleContext,
          newDate,
          assessmentReturnRescheduleMap,
        );
      } catch (error) {
        results.failure_count++;
        results.failures.push({
          attendance_id: id,
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

  private async prepareReturnRescheduleContextForAttendance(
    attendance: Attendance,
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

    const treatmentId = await this.getTreatmentIdForAttendanceId(
      attendance.id,
    );
    if (!treatmentId) {
      return {
        shouldEvaluate: false,
        treatmentId: null,
        oldLastTreatmentDate: null,
      };
    }

    let oldLastTreatmentDate =
      await this.sessionService.getMaxScheduledDateForTreatment(
        treatmentId,
      );
    if (
      attendance.scheduled_date &&
      (!oldLastTreatmentDate || attendance.scheduled_date > oldLastTreatmentDate)
    ) {
      oldLastTreatmentDate = attendance.scheduled_date;
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

    const returnAssessmentAttendances =
      await this.findReturnAssessmentAttendancesForTreatment(
        context.treatmentId,
        context.oldLastTreatmentDate,
      );
    const sessionInfo = await this.treatmentService.getSessionWithReturnConfig(
      context.treatmentId,
    );
    const returnWhenComplete = sessionInfo?.return_when_treatment_complete ?? false;
    const returnWeeks = sessionInfo?.return_weeks ?? 0;
    const shouldRescheduleReturns =
      returnAssessmentAttendances.length > 0 && (returnWhenComplete || returnWeeks > 0);

    if (!shouldRescheduleReturns) {
      return;
    }

    const returnDate = returnWhenComplete
      ? addDaysToDateString(newDate, returnWeeks * 7)
      : addDaysToDateString(newDate, 7);
    const adjustedReturnDate = await this.findNextSchedulableDate(
      returnDate,
      AttendanceType.ASSESSMENT,
    );

    for (const assessmentAtt of returnAssessmentAttendances) {
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
    for (const [assessmentAttendanceId, targetDate] of assessmentReturnRescheduleMap) {
      try {
        const assessmentAttendance = await this.findOne(assessmentAttendanceId);
        if (assessmentAttendance.scheduled_date === targetDate) {
          continue;
        }
        const previousDate = assessmentAttendance.scheduled_date;
        await this.postpone(assessmentAttendanceId, targetDate);
        results.auto_rescheduled_returns.push({
          attendance_id: assessmentAttendanceId,
          patient_id: assessmentAttendance.patient_id,
          patient_name: assessmentAttendance.patient?.name ?? 'Patient',
          old_date: previousDate,
          new_date: targetDate,
        });
      } catch (error) {
        results.failed_return_reschedules.push({
          attendance_id: assessmentAttendanceId,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        });
      }
    }
  }

  /**
   * Find assessment return attendances in the same episode that should move with treatment postponement.
   * Includes only scheduled assessment attendances with scheduled_date >= minScheduledDate.
   */
  private async findReturnAssessmentAttendancesForTreatment(
    treatmentId: number,
    minScheduledDate: string,
  ): Promise<Attendance[]> {
    const sessionInfo =
      await this.treatmentService.getSessionWithReturnConfig(
        treatmentId,
      );
    if (!sessionInfo) return [];

    const patientAttendances = await this.findByPatientId(sessionInfo.patient_id);
    const rootId = sessionInfo.attendance_id;
    const chainIds = new Set<number>([rootId]);

    let added = true;
    while (added) {
      added = false;
      for (const attDto of patientAttendances) {
        const parentId = attDto.parent_attendance_id;
        if (parentId != null && chainIds.has(parentId) && !chainIds.has(attDto.id)) {
          chainIds.add(attDto.id);
          added = true;
        }
      }
    }

    const assessmentAttendances: Attendance[] = [];
    for (const attDto of patientAttendances) {
      if (
        attDto.type === AttendanceType.ASSESSMENT &&
        attDto.status === AttendanceStatus.SCHEDULED &&
        attDto.parent_attendance_id != null &&
        chainIds.has(attDto.parent_attendance_id) &&
        attDto.scheduled_date >= minScheduledDate
      ) {
        const fullAttendance = await this.findOne(attDto.id);
        assessmentAttendances.push(fullAttendance);
      }
    }

    return assessmentAttendances;
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

    const reason = isFinalized && isBlockedByHoliday
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
   * treatment attendance. Reads the current max scheduled session date across ALL
   * treatment plans in the same consultation (the source of truth after all postpones
   * are committed), then moves the return assessment attendance if the computed date
   * differs from its current scheduled_date.
   *
   * This is the correct anchor for multi-treatment episodes: it avoids the per-call
   * "newDate" anchor used in bulkPostpone, which can cause ping-pong when multiple
   * treatment plans are moved to different dates in separate calls.
   */
  async recomputeReturnForEpisode(treatmentAttendanceId: number): Promise<{
    rescheduled: boolean;
    attendance_id?: number;
    patient_id?: number;
    patient_name?: string;
    old_date?: string;
    new_date?: string;
  }> {
    const treatmentId = await this.getTreatmentIdForAttendanceId(treatmentAttendanceId);
    if (!treatmentId) return { rescheduled: false };

    const sessionInfo = await this.treatmentService.getSessionWithReturnConfig(treatmentId);
    if (!sessionInfo?.consultation_id) return { rescheduled: false };

    const { consultation_id, return_weeks, return_when_treatment_complete } = sessionInfo;

    const shouldReschedule = return_when_treatment_complete || (return_weeks !== null && return_weeks > 0);
    if (!shouldReschedule) return { rescheduled: false };

    const treatmentIds = await this.treatmentService.getTreatmentIdsByConsultationId(consultation_id);
    if (treatmentIds.length === 0) return { rescheduled: false };

    let maxSessionDate: string | null = null;
    for (const tid of treatmentIds) {
      const date = await this.sessionService.getMaxScheduledDateForTreatment(tid);
      if (date && (!maxSessionDate || date > maxSessionDate)) {
        maxSessionDate = date;
      }
    }
    if (!maxSessionDate) return { rescheduled: false };

    const returnWeeksValue = return_weeks ?? 0;
    const rawReturnDate = returnWeeksValue > 0
      ? addDaysToDateString(maxSessionDate, returnWeeksValue * 7)
      : maxSessionDate;
    const targetDate = await this.findNextSchedulableDate(rawReturnDate, AttendanceType.ASSESSMENT);

    const returnAttendances = await this.findReturnAssessmentAttendancesForTreatment(
      treatmentId,
      maxSessionDate,
    );
    if (returnAttendances.length === 0) return { rescheduled: false };

    const returnAtt = returnAttendances[0];
    if (returnAtt.scheduled_date === targetDate) return { rescheduled: false };

    const previousDate = returnAtt.scheduled_date;
    await this.postpone(returnAtt.id, targetDate);

    return {
      rescheduled: true,
      attendance_id: returnAtt.id,
      patient_id: returnAtt.patient_id,
      patient_name: returnAtt.patient?.name ?? 'Patient',
      old_date: previousDate,
      new_date: targetDate,
    };
  }

  /**
   * Find unresolved past attendances (dates before today)
   * Returns dates with counts of attendances that are not completed, cancelled, or missed
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

    const unresolvedAttendances = await this.attendanceRepository
      .createQueryBuilder('attendance')
      .select('attendance.scheduled_date', 'date')
      .addSelect('COUNT(*)', 'count')
      .addSelect('ARRAY_AGG(DISTINCT attendance.status)', 'statuses')
      .where('attendance.scheduled_date < :today', { today })
      .andWhere('attendance.status NOT IN (:...resolvedStatuses)', {
        resolvedStatuses: [
          AttendanceStatus.COMPLETED,
          AttendanceStatus.CANCELLED,
          AttendanceStatus.MISSED,
        ],
      })
      .groupBy('attendance.scheduled_date')
      .orderBy('attendance.scheduled_date', 'ASC')
      .limit(10) // Safety limit to avoid performance issues
      .getRawMany();

    const dates = unresolvedAttendances.map((item) => ({
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

