import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import {
  SystemOption,
  SystemOptionType,
} from '../entities/system-option.entity';
import { Attendance } from '../entities/attendance.entity';
import { CreatePatientDto, UpdatePatientDto } from '../dtos/patient.dto';
import { AttendanceStatus, PatientStatus } from '../common/enums';
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
  PatientHasActiveAttendancesException,
} from '../common/exceptions';
import { AttendanceService } from './attendance.service';
import { TreatmentService } from './treatment.service';
import { PatientNoteService } from './patient-note.service';
import { CreatePatientNoteDto } from '../dtos/patient-note.dto';

interface TransitionToDischargedOrAbsentResult {
  patient: Patient;
  cancelledAttendances: Array<{
    id: number;
    type: string;
    scheduled_date: string;
  }>;
}

export interface SetPatientStatusResult {
  patient: Patient;
  cancelledAttendances?: Array<{
    id: number;
    type: string;
    scheduled_date: string;
  }>;
  unchanged?: boolean;
}

export interface SetPatientStatusOptions {
  /** Exclude these attendance IDs from cancellation (e.g. the one just completed via consultation flow). */
  excludeAttendanceIds?: number[];
  cancellationReason?: string;
  /**
   * Attendance IDs used to derive the "trigger date" for audit notes (e.g. cancellation requested from a specific attendance).
   * When not provided, the service falls back to excludeAttendanceIds[0] (when present) or to the current date in the patient's timezone.
   */
  triggerAttendanceIds?: number[];
}

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    @InjectRepository(SystemOption)
    private systemOptionsRepository: Repository<SystemOption>,
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    private attendanceService: AttendanceService,
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
      updatePatientDto.patient_status === PatientStatus.ABSENT
    ) {
      throw new ValidationException(
        'Use setPatientStatus to set status to Alta (A) or Faltas consecutivas (F).',
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
        PatientStatus.ABSENT,
      ],
      [PatientStatus.IN_TREATMENT]: [
        PatientStatus.DISCHARGED,
        PatientStatus.ABSENT,
        PatientStatus.NEW_PATIENT,
      ],
      [PatientStatus.DISCHARGED]: [PatientStatus.IN_TREATMENT],
      [PatientStatus.ABSENT]: [
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
      const completedCount = await this.attendanceRepository.count({
        where: { patient_id: id, status: AttendanceStatus.COMPLETED },
      });
      if (completedCount > 0) {
        throw new ValidationException(
          'Só é possível alterar para Novo Paciente quando o paciente não possui nenhum atendimento concluído.',
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

  private validateTimezoneForUpdate(
    updatePatientDto: UpdatePatientDto,
  ): void {
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
    const latestCompleted = await this.attendanceRepository
      .createQueryBuilder('a')
      .select('MAX(a.scheduled_date)', 'maxDate')
      .where('a.patient_id = :id', { id })
      .andWhere('a.status = :status', {
        status: AttendanceStatus.COMPLETED,
      })
      .getRawOne<{ maxDate: string }>();
    const lastCompletedDate = latestCompleted?.maxDate;
    if (
      lastCompletedDate &&
      updatePatientDto.discharge_date < lastCompletedDate
    ) {
      throw new ValidationException(
        `A data de alta não pode ser anterior à data do último atendimento concluído (${lastCompletedDate}).`,
      );
    }
  }

  /**
   * Single entry point for setting patient treatment status (N, T, A, or F).
   * For A/F: cancels open attendances and non-completed sessions, then updates patient.
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
      return { patient, cancelledAttendances: [], unchanged: true };
    }

    if (
      newStatus === PatientStatus.DISCHARGED ||
      newStatus === PatientStatus.ABSENT
    ) {
      const result = await this.transitionToDischargedOrAbsent(id, newStatus, {
        excludeAttendanceIds: options?.excludeAttendanceIds,
        cancellationReason: options?.cancellationReason,
        triggerAttendanceIds: options?.triggerAttendanceIds,
      });
      return {
        patient: result.patient,
        cancelledAttendances: result.cancelledAttendances,
        unchanged: false,
      };
    }

    // N or T: validate transition and update
    const validTransitions: Record<PatientStatus, PatientStatus[]> = {
      [PatientStatus.NEW_PATIENT]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.ABSENT,
      ],
      [PatientStatus.IN_TREATMENT]: [
        PatientStatus.DISCHARGED,
        PatientStatus.ABSENT,
        PatientStatus.NEW_PATIENT,
      ],
      [PatientStatus.DISCHARGED]: [PatientStatus.IN_TREATMENT],
      [PatientStatus.ABSENT]: [
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
      const completedCount = await this.attendanceRepository.count({
        where: {
          patient_id: id,
          status: AttendanceStatus.COMPLETED,
        },
      });
      if (completedCount > 0) {
        throw new ValidationException(
          'Só é possível alterar para Novo Paciente quando o paciente não possui nenhum atendimento concluído.',
        );
      }
    }

    this.patientRepository.merge(patient, { patient_status: newStatus });
    const savedPatient = await this.patientRepository.save(patient);
    return { patient: savedPatient, unchanged: false };
  }

  /**
   * Transition patient to Alta (A) or Faltas consecutivas (F).
   * Validates the transition, cancels all open attendances and non-completed treatments,
   * updates the patient, and returns the patient plus the list of cancelled attendances.
   * @internal Used only by setPatientStatus; callers should use setPatientStatus.
   */
  private async transitionToDischargedOrAbsent(
    id: number,
    newStatus: PatientStatus.DISCHARGED | PatientStatus.ABSENT,
    options?: {
      cancellationReason?: string;
      /** Exclude these attendance IDs from cancellation (e.g. the one just completed via consultation flow). */
      excludeAttendanceIds?: number[];
      triggerAttendanceIds?: number[];
    },
  ): Promise<TransitionToDischargedOrAbsentResult> {
    const patient = await this.findOne(id);

    const validTransitions: Record<PatientStatus, PatientStatus[]> = {
      [PatientStatus.NEW_PATIENT]: [
        PatientStatus.IN_TREATMENT,
        PatientStatus.ABSENT,
      ],
      [PatientStatus.IN_TREATMENT]: [
        PatientStatus.DISCHARGED,
        PatientStatus.ABSENT,
        PatientStatus.NEW_PATIENT,
      ],
      [PatientStatus.DISCHARGED]: [PatientStatus.IN_TREATMENT],
      [PatientStatus.ABSENT]: [
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
          ? 'Alta do tratamento'
          : 'Faltas consecutivas';

    const { date: nowInPatientTimezone } =
      getCurrentDateTimeInTimezone(patient.timezone);

    let triggerDate = nowInPatientTimezone;
    const triggerAttendanceId =
      options?.triggerAttendanceIds?.[0] ??
      options?.excludeAttendanceIds?.[0];

    if (typeof triggerAttendanceId === 'number') {
      const triggerAttendance = await this.attendanceRepository.findOne({
        where: { id: triggerAttendanceId },
      });
      if (triggerAttendance?.scheduled_date) {
        triggerDate = triggerAttendance.scheduled_date;
      }
    }

    const triggerDateBR = (() => {
      const value = triggerDate?.slice(0, 10);
      const parts = value?.split('-');
      if (parts?.length === 3) {
        const [yyyy, mm, dd] = parts;
        if (yyyy && mm && dd) return `${dd}/${mm}/${yyyy}`;
      }
      return triggerDate;
    })();

    const statusLabel =
      newStatus === PatientStatus.DISCHARGED
        ? `${PatientStatus.DISCHARGED} (Alta do tratamento)`
        : `${PatientStatus.ABSENT} (Faltas consecutivas)`;

    const cancelledAttendances =
      await this.attendanceService.cancelOpenAttendancesForPatient(
        id,
        cancellationReason,
        {
          excludeAttendanceIds: options?.excludeAttendanceIds,
        },
      );

    const sessions =
      await this.treatmentService.getTreatmentsByPatient(id);
    const nonCompleted = sessions.filter((s) => s.status !== 'completed');
    for (const session of nonCompleted) {
      await this.treatmentService.cancelTreatment(
        session.id,
        cancellationReason,
        { cancelLinkedOpenAttendances: false },
      );
    }

    this.patientRepository.merge(patient, { patient_status: newStatus });
    if (newStatus === PatientStatus.DISCHARGED) {
      patient.discharge_date = new Date().toISOString().split('T')[0];
    }

    const savedPatient = await this.patientRepository.save(patient);

    const noteCategory: CreatePatientNoteDto['category'] = 'alteracao_de_status';
    const detailedNoteEnabled = cancelledAttendances.length > 0;

    if (detailedNoteEnabled) {
      const byDate = new Map<
        string,
        { assessment: boolean; hasPhysiotherapy: boolean; hasTens: boolean }
      >();

      for (const cancelled of cancelledAttendances) {
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

      let noteContent = `Alteração de status do paciente para ${statusLabel} em ${triggerDateBR}.\nMotivo: ${cancellationReason}\nAtendimentos cancelados:\n`;

      for (const date of sortedDates) {
        const bucket = byDate.get(date);
        if (!bucket) continue;

        const parts: string[] = [];
        if (bucket.assessment) parts.push('Consulta de Avaliação');
        if (bucket.hasPhysiotherapy && bucket.hasTens) {
          parts.push('Fisioterapia e TENS');
        } else if (bucket.hasPhysiotherapy) {
          parts.push('Fisioterapia');
        } else if (bucket.hasTens) {
          parts.push('TENS');
        }

        if (parts.length === 0) continue;
        const dateParts = date?.slice(0, 10).split('-');
        const dateBR =
          dateParts?.length === 3 && dateParts[0] && dateParts[1] && dateParts[2]
            ? `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`
            : date;
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
        note_content: `Alteração de status do paciente para ${statusLabel} em ${triggerDateBR}.\nMotivo: ${cancellationReason}\nTodos os atendimentos abertos foram cancelados.`,
        category: noteCategory,
      };
      await this.patientNoteService.create(id, noteDto);
    }

    return { patient: savedPatient, cancelledAttendances };
  }

  async remove(id: number): Promise<void> {
    // Allow deleting only when all linked attendances are cancelled or missed.
    const blockingAttendancesCount = await this.attendanceRepository.count({
      where: {
        patient_id: id,
        status: Not(
          In([AttendanceStatus.CANCELLED, AttendanceStatus.MISSED]),
        ),
      },
    });

    if (blockingAttendancesCount > 0) {
      throw new PatientHasActiveAttendancesException(
        id,
        blockingAttendancesCount,
      );
    }

    const result = await this.patientRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Patient with ID ${id} not found`);
    }
  }
}
