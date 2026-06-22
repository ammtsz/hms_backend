import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientNote } from '../entities/patient-note.entity';
import { Patient } from '../entities/patient.entity';
import {
  SystemOption,
  SystemOptionType,
} from '../entities/system-option.entity';
import { ValidationException } from '../common/exceptions';
import {
  CreatePatientNoteDto,
  UpdatePatientNoteDto,
  PatientNoteResponseDto,
} from '../dtos/patient-note.dto';

@Injectable()
export class PatientNoteService {
  constructor(
    @InjectRepository(PatientNote)
    private patientNoteRepository: Repository<PatientNote>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    @InjectRepository(SystemOption)
    private systemOptionsRepository: Repository<SystemOption>,
  ) {}

  async create(
    patientId: number,
    createPatientNoteDto: CreatePatientNoteDto,
  ): Promise<PatientNoteResponseDto> {
    // Verify patient exists
    const patient = await this.patientRepository.findOne({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const category = createPatientNoteDto.category || 'general';
    await this.validateActiveNoteCategory(category);

    // Create the note
    const note = this.patientNoteRepository.create({
      patient_id: patientId,
      note_content: createPatientNoteDto.note_content,
      category,
    });

    const savedNote = await this.patientNoteRepository.save(note);
    return this.mapToResponseDto(savedNote);
  }

  async findByPatientId(patientId: number): Promise<PatientNoteResponseDto[]> {
    // Verify patient exists
    const patient = await this.patientRepository.findOne({
      where: { id: patientId },
    });

    if (!patient) {
      throw new NotFoundException(`Patient with ID ${patientId} not found`);
    }

    const notes = await this.patientNoteRepository.find({
      where: { patient_id: patientId },
      order: {
        created_date: 'DESC',
        created_time: 'DESC',
      },
    });

    return notes.map((note) => this.mapToResponseDto(note));
  }

  async findOne(
    patientId: number,
    noteId: number,
  ): Promise<PatientNoteResponseDto> {
    const note = await this.patientNoteRepository.findOne({
      where: { id: noteId, patient_id: patientId },
    });

    if (!note) {
      throw new NotFoundException(
        `Note with ID ${noteId} not found for patient ${patientId}`,
      );
    }

    return this.mapToResponseDto(note);
  }

  async update(
    patientId: number,
    noteId: number,
    updatePatientNoteDto: UpdatePatientNoteDto,
  ): Promise<PatientNoteResponseDto> {
    const note = await this.patientNoteRepository.findOne({
      where: { id: noteId, patient_id: patientId },
    });

    if (!note) {
      throw new NotFoundException(
        `Note with ID ${noteId} not found for patient ${patientId}`,
      );
    }

    // Update the note
    if (updatePatientNoteDto.note_content !== undefined) {
      note.note_content = updatePatientNoteDto.note_content;
    }
    if (updatePatientNoteDto.category !== undefined) {
      await this.validateActiveNoteCategory(updatePatientNoteDto.category);
      note.category = updatePatientNoteDto.category;
    }

    const updatedNote = await this.patientNoteRepository.save(note);
    return this.mapToResponseDto(updatedNote);
  }

  async remove(patientId: number, noteId: number): Promise<void> {
    const note = await this.patientNoteRepository.findOne({
      where: { id: noteId, patient_id: patientId },
    });

    if (!note) {
      throw new NotFoundException(
        `Note with ID ${noteId} not found for patient ${patientId}`,
      );
    }

    await this.patientNoteRepository.remove(note);
  }

  private mapToResponseDto(note: PatientNote): PatientNoteResponseDto {
    return {
      id: note.id,
      patient_id: note.patient_id,
      note_content: note.note_content,
      category: note.category,
      created_date: note.created_date,
      created_time: note.created_time,
      updated_date: note.updated_date,
      updated_time: note.updated_time,
    };
  }

  private async validateActiveNoteCategory(category: string): Promise<void> {
    const option = await this.systemOptionsRepository.findOne({
      where: {
        type: SystemOptionType.NOTE_CATEGORY,
        value: category,
        isActive: true,
      },
    });

    if (!option) {
      throw new ValidationException(
        `Invalid or inactive category: ${category}`,
      );
    }
  }
}
