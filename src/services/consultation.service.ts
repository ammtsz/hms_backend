import {
  Injectable,
  HttpException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Consultation } from '../entities/consultation.entity';
import { Appointment } from '../entities/appointment.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentService } from './treatment.service';
import { AppointmentService } from './appointment.service';
import { AppointmentType } from '../common/enums';
import { addDaysToDateString } from '../utils/date-string-helpers';
import {
  CreateConsultationDto,
  UpdateConsultationDto,
  ConsultationResult,
} from '../dtos/consultation.dto';
import {
  DuplicateConsultationException,
  InvalidReturnWeeksException,
  InvalidAppointmentStatusException,
} from '../common/exceptions';
import { PatientService } from './patient.service';
import { PatientStatus } from '../common/enums';

@Injectable()
export class ConsultationService {
  constructor(
    @InjectRepository(Consultation)
    private consultationRepository: Repository<Consultation>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    private treatmentService: TreatmentService,
    private appointmentService: AppointmentService,
    private patientService: PatientService,
  ) {}

  async create(
    createConsultationDto: CreateConsultationDto,
  ): Promise<ConsultationResult> {
    try {
      await this.validateForCreate(createConsultationDto);
      const appointment = await this.getAppointmentForCreate(
        createConsultationDto.appointment_id,
      );
      const consultationEntity = this.buildConsultationWithTiming(
        createConsultationDto,
        appointment,
      );
      const savedConsultation =
        await this.consultationRepository.save(consultationEntity);

      // Update patient's main_concern if this is a new treatment episode or new patient
      await this.updatePatientMainConcern(savedConsultation, appointment);

      const { patient_status } = createConsultationDto;
      if (patient_status) {
        const applied = await this.applyPatientStatusFromConsultation(
          appointment.id,
          appointment.patient_id,
          patient_status,
        );
        return {
          consultation: savedConsultation,
          cancelledAppointments: applied.cancelledAppointments,
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
        const match = error.detail.match(/Key \(appointment_id\)=\((\d+)\)/);
        const appointmentId = match ? parseInt(match[1]) : -1;
        throw new DuplicateConsultationException(appointmentId, -1);
      }
      throw error;
    }
  }

  async findAll(): Promise<Consultation[]> {
    return await this.consultationRepository.find({
      relations: ['appointment', 'appointment.patient'],
    });
  }

  async findOne(id: number): Promise<Consultation> {
    const consultation = await this.consultationRepository.findOne({
      where: { id },
      relations: ['appointment', 'appointment.patient'],
    });
    if (!consultation) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }
    return consultation;
  }

  async findByAppointment(appointmentId: number): Promise<Consultation> {
    const consultation = await this.consultationRepository.findOne({
      where: { appointment_id: appointmentId },
      relations: ['appointment', 'appointment.patient'],
    });
    if (!consultation) {
      throw new NotFoundException(
        `Consultation not found for appointment ${appointmentId}`,
      );
    }
    return consultation;
  }

  async findLatestByPatient(
    patientId: number,
  ): Promise<Consultation | null> {
    const consultation = await this.consultationRepository.findOne({
      where: {
        appointment: { patient_id: patientId },
      },
      relations: ['appointment', 'appointment.patient'],
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
      const appointment = await this.appointmentRepository.findOne({
        where: { id: updatedConsultation.appointment_id },
        select: ['patient_id', 'id'],
      });
      if (appointment) {
        const applied = await this.applyPatientStatusFromConsultation(
          appointment.id,
          appointment.patient_id,
          patient_status,
        );
        return {
          consultation: updatedConsultation,
          cancelledAppointments: applied.cancelledAppointments,
        };
      }
    }

    return { consultation: updatedConsultation };
  }

  /**
   * Apply patient treatment status from a consultation (single entry point).
   * Calls setPatientStatus with excludeAppointmentIds so the current appointment is not cancelled.
   */
  private async applyPatientStatusFromConsultation(
    appointmentId: number,
    patientId: number,
    treatmentStatus: string,
  ): Promise<{ cancelledAppointments: Array<{ id: number; type: string; scheduled_date: string }> }> {
    const result = await this.patientService.setPatientStatus(
      patientId,
      this.treatmentStatusStringToEnum(treatmentStatus),
      { excludeAppointmentIds: [appointmentId] },
    );
    return {
      cancelledAppointments: result.cancelledAppointments ?? [],
    };
  }

  /**
   * Map treatment status string from DTO ('N'|'T'|'D'|'C') to PatientStatus enum.
   */
  private treatmentStatusStringToEnum(
    status: string,
  ): PatientStatus {
    const map: Record<string, PatientStatus> = {
      N: PatientStatus.NEW_PATIENT,
      T: PatientStatus.IN_TREATMENT,
      D: PatientStatus.DISCHARGED,
      C: PatientStatus.CONSECUTIVE_NO_SHOWS,
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
      where: { appointment_id: dto.appointment_id },
    });
    if (existingConsultation) {
      throw new DuplicateConsultationException(
        dto.appointment_id,
        existingConsultation.id,
      );
    }
  }

  /** Load appointment for create; throws if not found or cancelled. */
  private async getAppointmentForCreate(
    appointmentId: number,
  ): Promise<Appointment> {
    const appointment = await this.appointmentRepository.findOne({
      where: { id: appointmentId },
      relations: ['patient'],
    });
    if (!appointment) {
      throw new NotFoundException(
        `Appointment with ID ${appointmentId} not found`,
      );
    }
    if (appointment.status === 'cancelled') {
      throw new InvalidAppointmentStatusException(
        appointmentId,
        appointment.status,
      );
    }
    return appointment;
  }

  /** Build consultation entity with start_time/end_time from appointment. */
  private buildConsultationWithTiming(
    dto: CreateConsultationDto,
    appointment: Appointment,
  ): Consultation {
    const consultation = this.consultationRepository.create(dto);
    const fallbackTime = new Date().toTimeString().split(' ')[0].substring(0, 8);
    if (!consultation.start_time) {
      consultation.start_time = appointment.started_time ?? fallbackTime;
    }
    if (!consultation.end_time) {
      consultation.end_time = appointment.completed_time ?? fallbackTime;
    }
    return consultation;
  }

  /**
   * Schedule return appointment for a consultation
   * Handles both legacy (immediate) and auto-return (deferred) modes
   * @param consultationId - ID of the consultation
   * @param mode - 'legacy' for immediate return, 'auto-return' for deferred return after sessions
   * @returns The created return appointment
   */
  async scheduleReturnAppointment(
    consultationId: number,
    mode: 'legacy' | 'auto-return',
  ): Promise<Appointment> {
    const consultation = await this.findOne(consultationId);

    if (!consultation.return_weeks || consultation.return_weeks <= 0) {
      throw new BadRequestException(
        `Consultation ${consultationId} has no return weeks configured`,
      );
    }

    const currentAppointment = consultation.appointment;

    if (currentAppointment.patient.patient_status === 'D') {
      throw new BadRequestException(
        `Cannot schedule return for discharged patient ${currentAppointment.patient_id}`,
      );
    }

    if (mode === 'auto-return') {
      throw new BadRequestException(
        `Auto-return mode should be triggered after treatment sessions complete, not via this endpoint`,
      );
    }

    return await this.createNextAppointment(consultation, currentAppointment);
  }
  async remove(id: number): Promise<void> {
    const result = await this.consultationRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Consultation with ID ${id} not found`);
    }
  }

  /**
   * Create next appointment based on return_weeks recommendation
   * @private
   */
  private async createNextAppointment(
    consultation: Consultation,
    currentAppointment: Appointment,
  ): Promise<Appointment> {
    try {
      // Use timezone-agnostic date string utilities
      const initialDateStr = addDaysToDateString(
        currentAppointment.scheduled_date,
        consultation.return_weeks * 7
      );

      // Check for holidays and finalized days and postpone if necessary for assessment consultations
      const adjustedDate =
        await this.appointmentService.findNextSchedulableDate(
          initialDateStr,
          AppointmentType.ASSESSMENT, // Follow-up is always assessment consultation
        );

      // Determine parent appointment ID:
      // - If current appointment has a parent, use that parent (link to original)
      // - Otherwise, use current appointment as parent (this is the original consultation)
      const parentAppointmentId =
        currentAppointment.parent_appointment_id || currentAppointment.id;

      // Create next appointment
      const returnAppointment = await this.appointmentService.create({
        patient_id: currentAppointment.patient_id,
        type: AppointmentType.ASSESSMENT, // Follow-up is always assessment consultation
        scheduled_date: adjustedDate,
        scheduled_time: currentAppointment.scheduled_time, // Same time as current
        notes: `Return automatically scheduled - ${consultation.return_weeks} week(s) after previous consultation`,
        parent_appointment_id: parentAppointmentId, // Link to original consultation
      });

      console.log(
        `✅ Auto-created next appointment for patient ${currentAppointment.patient_id} on ${adjustedDate} (parent_appointment_id: ${parentAppointmentId})`,
      );

      return returnAppointment;
    } catch (error) {
      console.error(
        `❌ Error creating next appointment for consultation ${consultation.id}:`,
        error,
      );
      throw error; // Throw so frontend knows scheduling failed
    }
  }

  /**
   * Updates the patient's main_concern based on consultation logic
   * Updates when:
   * - New patient (patient_status = 'N')
   * - New treatment episode (appointment.parent_appointment_id is null)
   * - Complaint is different from current patient complaint
   */
  private async updatePatientMainConcern(
    consultation: Consultation,
    appointment: Appointment,
  ): Promise<void> {
    try {
      // Only update if there's a main_concern in the consultation
      if (!consultation.main_concern?.trim()) {
        return;
      }

      // Get the current patient data
      const patient = await this.patientRepository.findOne({
        where: { id: appointment.patient_id },
      });

      if (!patient) {
        console.warn(`Patient not found for ID: ${appointment.patient_id}`);
        return;
      }

      // Determine if we should update the patient's main_concern
      const shouldUpdate =
        // New patient
        patient.patient_status === 'N' ||
        // New treatment episode (not a follow-up - appointment has no parent)
        !appointment.parent_appointment_id ||
        // Complaint is different from current patient complaint
        patient.main_concern !== consultation.main_concern;

      if (shouldUpdate) {
        await this.patientRepository.update(
          { id: appointment.patient_id },
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
          `✅ Updated patient ${appointment.patient_id} main_concern: "${consultation.main_concern}"`,
        );
      } else {
        console.log(
          `ℹ️ Patient ${appointment.patient_id} main_concern unchanged (follow-up or same complaint)`,
        );
      }
    } catch (error) {
      console.error(
        `❌ Error updating patient main_concern for patient ${appointment.patient_id}:`,
        error,
      );
      // Don't throw - this shouldn't break the consultation creation
    }
  }
}
