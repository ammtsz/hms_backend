import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { PatientNoteService } from '../patient-note.service';
import { PatientNote } from '../../entities/patient-note.entity';
import { Patient } from '../../entities/patient.entity';
import {
  SystemOption,
  SystemOptionType,
} from '../../entities/system-option.entity';
import { ValidationException } from '../../common/exceptions';

describe('PatientNoteService', () => {
  let service: PatientNoteService;
  let patientNoteRepo: {
    create: jest.Mock;
    save: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    remove: jest.Mock;
  };
  let patientRepo: { findOne: jest.Mock };
  let systemOptionRepo: { findOne: jest.Mock };

  const savedNoteShape = {
    id: 1,
    patient_id: 10,
    note_content: 'Content',
    category: 'general',
    created_date: '2025-01-01',
    created_time: '10:00:00',
    updated_date: '2025-01-01',
    updated_time: '10:00:00',
  };

  beforeEach(async () => {
    patientNoteRepo = {
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue(savedNoteShape),
      find: jest.fn().mockResolvedValue([savedNoteShape]),
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    patientRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 10 }),
    };
    systemOptionRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'general',
        isActive: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientNoteService,
        {
          provide: getRepositoryToken(PatientNote),
          useValue: patientNoteRepo,
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: patientRepo,
        },
        {
          provide: getRepositoryToken(SystemOption),
          useValue: systemOptionRepo,
        },
      ],
    }).compile();

    service = module.get(PatientNoteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should validate category against active NOTE_CATEGORY options', async () => {
      await service.create(10, { note_content: 'Obs' });

      expect(systemOptionRepo.findOne).toHaveBeenCalledWith({
        where: {
          type: SystemOptionType.NOTE_CATEGORY,
          value: 'general',
          isActive: true,
        },
      });
      expect(patientNoteRepo.save).toHaveBeenCalled();
    });

    it('should throw ValidationException when category is not an active option', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create(10, {
          note_content: 'Obs',
          category: 'unknown',
        }),
      ).rejects.toThrow(ValidationException);
      expect(patientNoteRepo.save).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when patient does not exist', async () => {
      patientRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.create(99, { note_content: 'Obs' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should validate new category when provided', async () => {
      patientNoteRepo.findOne.mockResolvedValueOnce({ ...savedNoteShape });
      systemOptionRepo.findOne.mockResolvedValueOnce({
        id: 2,
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'treatment',
        isActive: true,
      });

      await service.update(10, 1, { category: 'treatment' });

      expect(systemOptionRepo.findOne).toHaveBeenCalledWith({
        where: {
          type: SystemOptionType.NOTE_CATEGORY,
          value: 'treatment',
          isActive: true,
        },
      });
    });
  });
});
