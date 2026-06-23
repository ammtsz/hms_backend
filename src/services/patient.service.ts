import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import {
  SystemOption,
  SystemOptionType,
} from '../entities/system-option.entity';
import { Appointment } from '../entities/appointment.entity';
import { CreatePatientDto, UpdatePatientDto } from '../dtos/patient.dto';
import { AppointmentStatus, PatientStatus } from '../common/enums';
import {
  isValidTimezone,
  getCurrentDateTimeInTimezone,
  getClinicTimezone,
} from '../common/utils/timezone.utils';
import {
  ValidationException,
  DuplicatePatientException,
  InvalidPatientPriorityException,
  PatientStatusUpdateException,
  PatientHasActiveAppointmentsException,
} from '../common/exceptions';
import { AppointmentService } from './appointment.service';
import { TreatmentService } from './treatment.service';
import { formatDisplayDate } from '../utils/date-string-helpers';
import { PatientNoteService } from './patient-note.service';
import { CreatePatientNoteDto } from '../dtos/patient-note.dto';

interface TransitionToDischargedOrConsecutiveNoShowsResult {
  patient: Patient;
  cancelledAppointments: Array<{
    id: number;
    type: string;
    scheduled_date: string;
  }>;
}

export interface SetPatientStatusResult {
  patient: Patient;
  cancelledAppointments?: Array<{
    id: number;
    type: string;
    scheduled_date: string;
  }>;
  unchanged?: boolean;
}

export interface SetPatientStatusOptions {
  /** Exclude these appointment IDs from cancellation (e.g. the one just completed via consultation flow). */
  excludeAppointmentIds?: number[];
  cancellationReason?: string;
  /**
   * Appointment IDs used to derive the "trigger date" for audit notes (e.g. cancellation requested from a specific appointment).
   * When not provided, the service falls back to excludeAppointmentIds[0] (when present) or to the current date in the patient's timezone.
   */
  triggerAppointmentIds?: number[];
}

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    @InjectRepository(SystemOption)
    private systemOptionsRepository: Repository<SystemOption>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    private appointmentService: AppointmentService,
    private treatmentService: TreatmentService,
    private patientNoteService: PatientNoteService,
  ) {}

  async create(createPatientDto: CreatePatientDto): Promise<Patient> {
    // Check for duplicate patient
    const existingPatient = await this.patientRepository.findOne({
      where: {
        name: createPatientDto.name,
        phone: createPatientDto.phone,
      },
    });

    if (existingPatient) {
      throw new DuplicatePatientException(
        createPatientDto.name,
        createPatientDto.phone,
        existingPatient.id,
      );
    }

    // Validate priority if it exists in the DTO
    if (createPatientDto.priority) {
      const activePriorities = await this.getActivePriorityCodes();
      if (!activePriorities.includes(createPatientDto.priority)) {
        throw new InvalidPatientPriorityException(
          createPatientDto.priority,
          activePriorities,
        );
      }
    }

    // Validate timezone if provided, otherwise use server's timezone
    let patientTimezone: string;

    if (createPatientDto.timezone) {
      if (!isValidTimezone(createPatientDto.timezone)) {
        throw new ValidationException(
          `Invalid timezone: ${createPatientDto.timezone}. Must be a valid IANA timezone identifier.`,
        );
      }
      patientTimezone = createPatientDto.timezone;
    } else {
      // Use clinic timezone (CLINIC_TIMEZONE env var)
      patientTimezone = getClinicTimezone();
      createPatientDto.timezone = patientTimezone;
    }

    // Calculate start_date based on server's timezone to avoid timezone conversion issues
    const { date: startDate } = getCurrentDateTimeInTimezone(patientTimezone);

    const patient = this.patientRepository.create({
      ...createPatientDto,
      start_date: startDate, // Explicitly set start_date in patient's timezone
    });
    return await this.patientRepository.save(patient);
  }

  async findAll(): Promise<Patient[]> {
    return await this.patientRepository.find();
  }

  async findOne(id: number): Promise<Patient> {
    const patient = await this.patientRepository.findOne({ where: { id } });
    if (!patient) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
    return patient;
  }

  async update(
    id: number,
    updatePatientDto: UpdatePatientDto,
  ): Promise<Patient> {
    const patient = await this.findOne(id);

    this.validateUpdateNotEmpty(updatePatientDto);
    this.validateNoDirectAf(updatePatientDto);
    await this.validateStatusTransitionForUpdate(id, patient, updatePatientDto);
    await this.validatePriorityForUpdate(updatePatientDto);
    this.validateTimezoneForUpdate(updatePatientDto);
    await this.validateDischargeDateForUpdate(id, updatePatientDto);

    this.patientRepository.merge(patient, updatePatientDto);
    return await this.patientRepository.save(patient);
  }

  private validateUpdateNotEmpty(updatePatientDto: UpdatePatientDto): void {
    if (Object.keys(updatePatientDto).length === 0) {
      throw new ValidationException(
        'At least one field must be provided for update',
      );
    }
  }

  private validateNoDirectAf(updatePatientDto: UpdatePatientDto): void {
    if (
      updatePatientDto.patient_status === PatientStatus.DISCHARGED ||
      updatePatientDto.patient_status === PatientStatus.CONSECUTIVE_NO_SHOWS
    ) {
      throw new ValidationException(
        'Use setPatientStatus to set status to Discharged (D) or Consecutive no-shows (C).',
      );
    }
  }

  private async validateStatusTransitionForUpdate(
    id: number,
    patient: Patient,
    updatePatientDto: UpdatePatientDto,
  ): Promise<void> {
    if (
      !updatePatientDto.patient_status ||
      updatePatientDto.patient_status === patient.patient_status
    ) {
      return;
    }
    const validTransitions: Record<PatientStatus, PatientStatus[]> = {
      [PatientStatus.NEW_PATIENT]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
      ],
      [PatientStatus.IN_TREATMENT]: [
        PatientStatus.DISCHARGED,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        PatientStatus.NEW_PATIENT,
      ],
      [PatientStatus.DISCHARGED]: [PatientStatus.IN_TREATMENT],
      [PatientStatus.CONSECUTIVE_NO_SHOWS]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.NEW_PATIENT,
      ],
    };
    if (
      !validTransitions[patient.patient_status]?.includes(
        updatePatientDto.patient_status,
      )
    ) {
      throw new PatientStatusUpdateException(
        id,
        patient.patient_status,
        updatePatientDto.patient_status,
        'Invalid treatment status transition',
      );
    }
    if (updatePatientDto.patient_status === PatientStatus.NEW_PATIENT) {
      const completedCount = await this.appointmentRepository.count({
        where: { patient_id: id, status: AppointmentStatus.COMPLETED },
      });
      if (completedCount > 0) {
        throw new ValidationException(
          'Can only change to New Patient status when the patient has no completed appointment.',
        );
      }
    }
  }

  private async validatePriorityForUpdate(
    updatePatientDto: UpdatePatientDto,
  ): Promise<void> {
    if (!updatePatientDto.priority) return;
    const activePriorities = await this.getActivePriorityCodes();
    if (!activePriorities.includes(updatePatientDto.priority)) {
      throw new InvalidPatientPriorityException(
        updatePatientDto.priority,
        activePriorities,
      );
    }
  }

  private async getActivePriorityCodes(): Promise<string[]> {
    const priorities = await this.systemOptionsRepository.find({
      where: {
        type: SystemOptionType.PRIORITY,
        isActive: true,
      },
      select: ['value'],
    });

    return priorities.map((p) => p.value);
  }

  private validateTimezoneForUpdate(updatePatientDto: UpdatePatientDto): void {
    if (
      updatePatientDto.timezone &&
      !isValidTimezone(updatePatientDto.timezone)
    ) {
      throw new ValidationException(
        `Invalid timezone: ${updatePatientDto.timezone}. Must be a valid IANA timezone identifier.`,
      );
    }
  }

  private async validateDischargeDateForUpdate(
    id: number,
    updatePatientDto: UpdatePatientDto,
  ): Promise<void> {
    if (updatePatientDto.discharge_date == null) return;
    const latestCompleted = await this.appointmentRepository
      .createQueryBuilder('a')
      .select('MAX(a.scheduled_date)', 'maxDate')
      .where('a.patient_id = :id', { id })
      .andWhere('a.status = :status', {
        status: AppointmentStatus.COMPLETED,
      })
      .getRawOne<{ maxDate: string }>();
    const lastCompletedDate = latestCompleted?.maxDate;
    if (
      lastCompletedDate &&
      updatePatientDto.discharge_date < lastCompletedDate
    ) {
      throw new ValidationException(
        `The discharge date cannot be earlier than the date of the last completed appointment (${lastCompletedDate}).`,
      );
    }
  }

  /**
   * Single entry point for setting patient treatment status (N, T, D, or C).
   * For D/C: cancels open appointments and non-completed sessions, then updates patient.
   * For N/T: validates transition and updates patient only.
   * Returns unchanged: true when the patient already has the target status.
   */
  async setPatientStatus(
    id: number,
    newStatus: PatientStatus,
    options?: SetPatientStatusOptions,
  ): Promise<SetPatientStatusResult> {
    const patient = await this.findOne(id);

    if (patient.patient_status === newStatus) {
      return { patient, cancelledAppointments: [], unchanged: true };
    }

    if (
      newStatus === PatientStatus.DISCHARGED ||
      newStatus === PatientStatus.CONSECUTIVE_NO_SHOWS
    ) {
      const result = await this.transitionToDischargedOrConsecutiveNoShows(
        id,
        newStatus,
        {
          excludeAppointmentIds: options?.excludeAppointmentIds,
          cancellationReason: options?.cancellationReason,
          triggerAppointmentIds: options?.triggerAppointmentIds,
        },
      );
      return {
        patient: result.patient,
        cancelledAppointments: result.cancelledAppointments,
        unchanged: false,
      };
    }

    // N or T: validate transition and update
    const validTransitions: Record<PatientStatus, PatientStatus[]> = {
      [PatientStatus.NEW_PATIENT]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
      ],
      [PatientStatus.IN_TREATMENT]: [
        PatientStatus.DISCHARGED,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        PatientStatus.NEW_PATIENT,
      ],
      [PatientStatus.DISCHARGED]: [PatientStatus.IN_TREATMENT],
      [PatientStatus.CONSECUTIVE_NO_SHOWS]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.NEW_PATIENT,
      ],
    };

    if (!validTransitions[patient.patient_status]?.includes(newStatus)) {
      throw new PatientStatusUpdateException(
        id,
        patient.patient_status,
        newStatus,
        'Invalid treatment status transition',
      );
    }

    if (newStatus === PatientStatus.NEW_PATIENT) {
      const completedCount = await this.appointmentRepository.count({
        where: {
          patient_id: id,
          status: AppointmentStatus.COMPLETED,
        },
      });
      if (completedCount > 0) {
        throw new ValidationException(
          'Can only change to New Patient status when the patient has no completed appointment.',
        );
      }
    }

    this.patientRepository.merge(patient, { patient_status: newStatus });
    const savedPatient = await this.patientRepository.save(patient);
    return { patient: savedPatient, unchanged: false };
  }

  /**
   * Transition patient to Discharged (D) or Consecutive no-shows (C).
   * Validates the transition, cancels all open appointments and non-completed treatments,
   * updates the patient, and returns the patient plus the list of cancelled appointments.
   * @internal Used only by setPatientStatus; callers should use setPatientStatus.
   */
  private async transitionToDischargedOrConsecutiveNoShows(
    id: number,
    newStatus: PatientStatus.DISCHARGED | PatientStatus.CONSECUTIVE_NO_SHOWS,
    options?: {
      cancellationReason?: string;
      /** Exclude these appointment IDs from cancellation (e.g. the one just completed via consultation flow). */
      excludeAppointmentIds?: number[];
      triggerAppointmentIds?: number[];
    },
  ): Promise<TransitionToDischargedOrConsecutiveNoShowsResult> {
    const patient = await this.findOne(id);

    const validTransitions: Record<PatientStatus, PatientStatus[]> = {
      [PatientStatus.NEW_PATIENT]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
      ],
      [PatientStatus.IN_TREATMENT]: [
        PatientStatus.DISCHARGED,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        PatientStatus.NEW_PATIENT,
      ],
      [PatientStatus.DISCHARGED]: [PatientStatus.IN_TREATMENT],
      [PatientStatus.CONSECUTIVE_NO_SHOWS]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.NEW_PATIENT,
      ],
    };

    if (!validTransitions[patient.patient_status]?.includes(newStatus)) {
      throw new PatientStatusUpdateException(
        id,
        patient.patient_status,
        newStatus,
        'Invalid treatment status transition',
      );
    }

    const cancellationReasonFromOptions = options?.cancellationReason?.trim();
    const cancellationReason =
      cancellationReasonFromOptions && cancellationReasonFromOptions.length > 0
        ? cancellationReasonFromOptions
        : newStatus === PatientStatus.DISCHARGED
          ? 'Discharged'
          : 'Consecutive no-shows';

    const { date: nowInPatientTimezone } = getCurrentDateTimeInTimezone(
      patient.timezone,
    );

    let triggerDate = nowInPatientTimezone;
    const triggerAppointmentId =
      options?.triggerAppointmentIds?.[0] ?? options?.excludeAppointmentIds?.[0];

    if (typeof triggerAppointmentId === 'number') {
      const triggerAppointment = await this.appointmentRepository.findOne({
        where: { id: triggerAppointmentId },
      });
      if (triggerAppointment?.scheduled_date) {
        triggerDate = triggerAppointment.scheduled_date;
      }
    }

    const triggerDateBR = triggerDate
      ? formatDisplayDate(triggerDate.slice(0, 10))
      : triggerDate;

    const statusLabel =
      newStatus === PatientStatus.DISCHARGED
        ? 'Discharged'
        : 'Consecutive no-shows';

    const cancelledAppointments =
      await this.appointmentService.cancelOpenAppointmentsForPatient(
        id,
        cancellationReason,
        {
          excludeAppointmentIds: options?.excludeAppointmentIds,
        },
      );

    const sessions = await this.treatmentService.getTreatmentsByPatient(id);
    const nonCompleted = sessions.filter((s) => s.status !== 'completed');
    for (const session of nonCompleted) {
      await this.treatmentService.cancelTreatment(
        session.id,
        cancellationReason,
        { cancelLinkedOpenAppointments: false },
      );
    }

    this.patientRepository.merge(patient, { patient_status: newStatus });
    if (newStatus === PatientStatus.DISCHARGED) {
      patient.discharge_date = new Date().toISOString().split('T')[0];
    }

    const savedPatient = await this.patientRepository.save(patient);

    const noteCategory: CreatePatientNoteDto['category'] = 'status_change';
    const detailedNoteEnabled = cancelledAppointments.length > 0;

    if (detailedNoteEnabled) {
      const byDate = new Map<
        string,
        { assessment: boolean; hasPhysiotherapy: boolean; hasTens: boolean }
      >();

      for (const cancelled of cancelledAppointments) {
        const current = byDate.get(cancelled.scheduled_date) ?? {
          assessment: false,
          hasPhysiotherapy: false,
          hasTens: false,
        };
        if (cancelled.type === 'assessment') {
          current.assessment = true;
        }
        if (cancelled.type === 'physiotherapy') {
          current.hasPhysiotherapy = true;
        }
        if (cancelled.type === 'tens') {
          current.hasTens = true;
        }
        byDate.set(cancelled.scheduled_date, current);
      }

      const sortedDates = Array.from(byDate.keys()).sort();
      const maxNoteLength = 1900; // keep below backend 2000 char validation

      let noteContent = `Patient status changed to ${statusLabel} on ${triggerDateBR}.\nReason: ${cancellationReason}\nCancelled appointments:\n`;

      for (const date of sortedDates) {
        const bucket = byDate.get(date);
        if (!bucket) continue;

        const parts: string[] = [];
        if (bucket.assessment) parts.push('Assessment consultation');
        if (bucket.hasPhysiotherapy && bucket.hasTens) {
          parts.push('Physiotherapy and TENS');
        } else if (bucket.hasPhysiotherapy) {
          parts.push('Physiotherapy');
        } else if (bucket.hasTens) {
          parts.push('TENS');
        }

        if (parts.length === 0) continue;
        const dateBR = formatDisplayDate(date.slice(0, 10));
        const line = `- ${dateBR}: ${parts.join(', ')}\n`;
        if (noteContent.length + line.length > maxNoteLength) break;
        noteContent += line;
      }

      if (noteContent.length > maxNoteLength) {
        noteContent = noteContent.slice(0, maxNoteLength).trimEnd() + '…\n';
      }

      const noteDto: CreatePatientNoteDto = {
        note_content: noteContent,
        category: noteCategory,
      };

      await this.patientNoteService.create(id, noteDto);
    } else {
      const noteDto: CreatePatientNoteDto = {
        note_content: `Patient status changed to ${statusLabel} on ${triggerDateBR}.\nReason: ${cancellationReason}\nAll open appointments were cancelled.`,
        category: noteCategory,
      };
      await this.patientNoteService.create(id, noteDto);
    }

    return { patient: savedPatient, cancelledAppointments };
  }

  async remove(id: number): Promise<void> {
    // Allow deleting only when all linked appointments are cancelled or missed.
    const blockingAppointmentsCount = await this.appointmentRepository.count({
      where: {
        patient_id: id,
        status: Not(In([AppointmentStatus.CANCELLED, AppointmentStatus.MISSED])),
      },
    });

    if (blockingAppointmentsCount > 0) {
      throw new PatientHasActiveAppointmentsException(
        id,
        blockingAppointmentsCount,
      );
    }

    const result = await this.patientRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
  }
}
