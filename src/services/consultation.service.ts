import {
  Injectable,
  HttpException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consultation } from '../entities/consultation.entity';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentService } from './treatment.service';
import { AttendanceService } from './attendance.service';
import { AttendanceType } from '../common/enums';
import { addDaysToDateString } from '../utils/date-string-helpers';
import {
  CreateConsultationDto,
  UpdateConsultationDto,
  ConsultationResult,
} from '../dtos/consultation.dto';
import {
  DuplicateConsultationException,
  InvalidReturnWeeksException,
  InvalidAttendanceStatusException,
} from '../common/exceptions';
import { PatientService } from './patient.service';
import { PatientStatus } from '../common/enums';

@Injectable()
export class ConsultationService {
  constructor(
    @InjectRepository(Consultation)
    private consultationRepository: Repository<Consultation>,
    @InjectRepository(Attendance)
    private attendanceRepository: Repository<Attendance>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private treatmentService: TreatmentService,
    private attendanceService: AttendanceService,
    private patientService: PatientService,
  ) {}

  async create(
    createConsultationDto: CreateConsultationDto,
  ): Promise<ConsultationResult> {
    try {
      await this.validateForCreate(createConsultationDto);
      const attendance = await this.getAttendanceForCreate(
        createConsultationDto.attendance_id,
      );
      const consultationEntity = this.buildConsultationWithTiming(
        createConsultationDto,
        attendance,
      );
      const savedConsultation =
        await this.consultationRepository.save(consultationEntity);

      // Update patient's main_concern if this is a new treatment episode or new patient
      await this.updatePatientMainConcern(savedConsultation, attendance);

      const { patient_status } = createConsultationDto;
      if (patient_status) {
        const applied = await this.applyPatientStatusFromConsultation(
          attendance.id,
          attendance.patient_id,
          patient_status,
        );
        return {
          consultation: savedConsultation,
          cancelledAttendances: applied.cancelledAttendances,
        };
      }

      return { consultation: savedConsultation };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      // Handle database-specific errors
      if (error.code === '23505') {
        // unique_violation
        const match = error.detail.match(/Key \(attendance_id\)=\((\d+)\)/);
        const attendanceId = match ? parseInt(match[1]) : -1;
        throw new DuplicateConsultationException(attendanceId, -1);
      }
      throw error;
    }
  }

  async findAll(): Promise<Consultation[]> {
    return await this.consultationRepository.find({
      relations: ['attendance', 'attendance.patient'],
    });
  }

  async findOne(id: number): Promise<Consultation> {
    const consultation = await this.consultationRepository.findOne({
      where: { id },
      relations: ['attendance', 'attendance.patient'],
    });
    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }
    return consultation;
  }

  async findByAttendance(attendanceId: number): Promise<Consultation> {
    const consultation = await this.consultationRepository.findOne({
      where: { attendance_id: attendanceId },
      relations: ['attendance', 'attendance.patient'],
    });
    if (!consultation) {
      throw new NotFoundException(
        `Consultation not found for attendance ${attendanceId}`,
      );
    }
    return consultation;
  }

  async findLatestByPatient(
    patientId: number,
  ): Promise<Consultation | null> {
    const consultation = await this.consultationRepository.findOne({
      where: {
        attendance: { patient_id: patientId },
      },
      relations: ['attendance', 'attendance.patient'],
      order: {
        created_date: 'DESC',
        created_time: 'DESC',
      },
    });

    // Return null if not found (this is expected for new patients)
    return consultation || null;
  }

  async update(
    id: number,
    updateData: UpdateConsultationDto,
  ): Promise<ConsultationResult> {
    // Validate return weeks if provided
    if (
      updateData.return_weeks !== undefined &&
      (updateData.return_weeks < 0 || updateData.return_weeks > 52)
    ) {
      throw new BadRequestException(
        `Return weeks must be between 0 and 52, got: ${updateData.return_weeks}`,
      );
    }

    // Store patient_status on consultation flow (and also use it for patient update)
    const { patient_status } = updateData;

    // Update the consultation
    await this.consultationRepository.update(id, updateData);
    const updatedConsultation = await this.findOne(id);

    if (patient_status) {
      const attendance = await this.attendanceRepository.findOne({
        where: { id: updatedConsultation.attendance_id },
        select: ['patient_id', 'id'],
      });
      if (attendance) {
        const applied = await this.applyPatientStatusFromConsultation(
          attendance.id,
          attendance.patient_id,
          patient_status,
        );
        return {
          consultation: updatedConsultation,
          cancelledAttendances: applied.cancelledAttendances,
        };
      }
    }

    return { consultation: updatedConsultation };
  }

  /**
   * Apply patient treatment status from a consultation (single entry point).
   * Calls setPatientStatus with excludeAttendanceIds so the current attendance is not cancelled.
   */
  private async applyPatientStatusFromConsultation(
    attendanceId: number,
    patientId: number,
    treatmentStatus: string,
  ): Promise<{ cancelledAttendances: Array<{ id: number; type: string; scheduled_date: string }> }> {
    const result = await this.patientService.setPatientStatus(
      patientId,
      this.treatmentStatusStringToEnum(treatmentStatus),
      { excludeAttendanceIds: [attendanceId] },
    );
    return {
      cancelledAttendances: result.cancelledAttendances ?? [],
    };
  }

  /**
   * Map treatment status string from DTO ('N'|'T'|'A'|'F') to PatientStatus enum.
   */
  private treatmentStatusStringToEnum(
    status: string,
  ): PatientStatus {
    const map: Record<string, PatientStatus> = {
      N: PatientStatus.NEW_PATIENT,
      T: PatientStatus.IN_TREATMENT,
      A: PatientStatus.DISCHARGED,
      F: PatientStatus.ABSENT,
    };
    const value = map[status];
    if (!value) {
      throw new BadRequestException(`Invalid treatment status: ${status}`);
    }
    return value;
  }

  /** Validate create DTO and ensure no duplicate consultation; throws if invalid. */
  private async validateForCreate(
    dto: CreateConsultationDto,
  ): Promise<void> {
    if (
      dto.return_weeks !== undefined &&
      (dto.return_weeks < 0 || dto.return_weeks > 52)
    ) {
      throw new InvalidReturnWeeksException(dto.return_weeks);
    }
    const existingConsultation = await this.consultationRepository.findOne({
      where: { attendance_id: dto.attendance_id },
    });
    if (existingConsultation) {
      throw new DuplicateConsultationException(
        dto.attendance_id,
        existingConsultation.id,
      );
    }
  }

  /** Load attendance for create; throws if not found or cancelled. */
  private async getAttendanceForCreate(
    attendanceId: number,
  ): Promise<Attendance> {
    const attendance = await this.attendanceRepository.findOne({
      where: { id: attendanceId },
      relations: ['patient'],
    });
    if (!attendance) {
      throw new NotFoundException(
        `Attendance with ID ${attendanceId} not found`,
      );
    }
    if (attendance.status === 'cancelled') {
      throw new InvalidAttendanceStatusException(
        attendanceId,
        attendance.status,
      );
    }
    return attendance;
  }

  /** Build consultation entity with start_time/end_time from attendance. */
  private buildConsultationWithTiming(
    dto: CreateConsultationDto,
    attendance: Attendance,
  ): Consultation {
    const consultation = this.consultationRepository.create(dto);
    const fallbackTime = new Date().toTimeString().split(' ')[0].substring(0, 8);
    if (!consultation.start_time) {
      consultation.start_time = attendance.started_time ?? fallbackTime;
    }
    if (!consultation.end_time) {
      consultation.end_time = attendance.completed_time ?? fallbackTime;
    }
    return consultation;
  }

  /**
   * Schedule return attendance for a consultation
   * Handles both legacy (immediate) and auto-return (deferred) modes
   * @param consultationId - ID of the consultation
   * @param mode - 'legacy' for immediate return, 'auto-return' for deferred return after sessions
   * @returns The created return attendance
   */
  async scheduleReturnAttendance(
    consultationId: number,
    mode: 'legacy' | 'auto-return',
  ): Promise<Attendance> {
    const consultation = await this.findOne(consultationId);

    if (!consultation.return_weeks || consultation.return_weeks <= 0) {
      throw new BadRequestException(
        `Consultation ${consultationId} has no return weeks configured`,
      );
    }

    const currentAttendance = consultation.attendance;

    if (currentAttendance.patient.patient_status === 'A') {
      throw new BadRequestException(
        `Cannot schedule return for discharged patient ${currentAttendance.patient_id}`,
      );
    }

    if (mode === 'auto-return') {
      throw new BadRequestException(
        `Auto-return mode should be triggered after treatment sessions complete, not via this endpoint`,
      );
    }

    return await this.createNextAttendance(consultation, currentAttendance);
  }
  async remove(id: number): Promise<void> {
    const result = await this.consultationRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }
  }

  /**
   * Create next attendance based on return_weeks recommendation
   * @private
   */
  private async createNextAttendance(
    consultation: Consultation,
    currentAttendance: Attendance,
  ): Promise<Attendance> {
    try {
      // Use timezone-agnostic date string utilities
      const initialDateStr = addDaysToDateString(
        currentAttendance.scheduled_date,
        consultation.return_weeks * 7
      );

      // Check for holidays and finalized days and postpone if necessary for assessment consultations
      const adjustedDate =
        await this.attendanceService.findNextSchedulableDate(
          initialDateStr,
          AttendanceType.ASSESSMENT, // Follow-up is always assessment consultation
        );

      // Determine parent attendance ID:
      // - If current attendance has a parent, use that parent (link to original)
      // - Otherwise, use current attendance as parent (this is the original consultation)
      const parentAttendanceId =
        currentAttendance.parent_attendance_id || currentAttendance.id;

      // Create next attendance
      const returnAttendance = await this.attendanceService.create({
        patient_id: currentAttendance.patient_id,
        type: AttendanceType.ASSESSMENT, // Follow-up is always assessment consultation
        scheduled_date: adjustedDate,
        scheduled_time: currentAttendance.scheduled_time, // Same time as current
        notes: `Return automatically scheduled - ${consultation.return_weeks} week(s) after previous consultation`,
        parent_attendance_id: parentAttendanceId, // Link to original consultation
      });

      console.log(
        `✅ Auto-created next attendance for patient ${currentAttendance.patient_id} on ${adjustedDate} (parent_attendance_id: ${parentAttendanceId})`,
      );

      return returnAttendance;
    } catch (error) {
      console.error(
        `❌ Error creating next attendance for consultation ${consultation.id}:`,
        error,
      );
      throw error; // Throw so frontend knows scheduling failed
    }
  }

  /**
   * Updates the patient's main_concern based on consultation logic
   * Updates when:
   * - New patient (patient_status = 'N')
   * - New treatment episode (attendance.parent_attendance_id is null)
   * - Complaint is different from current patient complaint
   */
  private async updatePatientMainConcern(
    consultation: Consultation,
    attendance: Attendance,
  ): Promise<void> {
    try {
      // Only update if there's a main_concern in the consultation
      if (!consultation.main_concern?.trim()) {
        return;
      }

      // Get the current patient data
      const patient = await this.patientRepository.findOne({
        where: { id: attendance.patient_id },
      });

      if (!patient) {
        console.warn(`Patient not found for ID: ${attendance.patient_id}`);
        return;
      }

      // Determine if we should update the patient's main_concern
      const shouldUpdate =
        // New patient
        patient.patient_status === 'N' ||
        // New treatment episode (not a follow-up - attendance has no parent)
        !attendance.parent_attendance_id ||
        // Complaint is different from current patient complaint
        patient.main_concern !== consultation.main_concern;

      if (shouldUpdate) {
        await this.patientRepository.update(
          { id: attendance.patient_id },
          {
            main_concern: consultation.main_concern,
            updated_date: new Date().toISOString().split('T')[0],
            updated_time: new Date()
              .toTimeString()
              .split(' ')[0]
              .substring(0, 8),
          },
        );

        console.log(
          `✅ Updated patient ${attendance.patient_id} main_concern: "${consultation.main_concern}"`,
        );
      } else {
        console.log(
          `ℹ️ Patient ${attendance.patient_id} main_concern unchanged (follow-up or same complaint)`,
        );
      }
    } catch (error) {
      console.error(
        `❌ Error updating patient main_concern for patient ${attendance.patient_id}:`,
        error,
      );
      // Don't throw - this shouldn't break the consultation creation
    }
  }
}
