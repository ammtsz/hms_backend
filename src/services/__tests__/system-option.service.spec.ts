import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { SystemOptionService } from '../system-option.service';
import {
  SystemOption,
  SystemOptionType,
} from '../../entities/system-option.entity';
import { Patient } from '../../entities/patient.entity';
import { PatientNote } from '../../entities/patient-note.entity';
import { Treatment } from '../../entities/treatment.entity';
import { PatientPriority } from '../../common/enums';

describe('SystemOptionService', () => {
  let service: SystemOptionService;
  let systemOptionRepo: {
    createQueryBuilder: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
  let patientRepo: {
    find: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let patientNoteRepo: { createQueryBuilder: jest.Mock };
  let treatmentSessionRepo: { createQueryBuilder: jest.Mock };

  const qb = (raw: Record<string, unknown>) => ({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(raw),
  });

  const priorityOption = (value: string, id = 5): SystemOption =>
    ({
      id,
      type: SystemOptionType.PRIORITY,
      value,
      label: null,
      sortOrder: 1,
      isActive: true,
    }) as SystemOption;

  beforeEach(async () => {
    systemOptionRepo = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      }),
      findOne: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn((v) => Promise.resolve(v)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    patientRepo = {
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 2 }),
      createQueryBuilder: jest.fn(),
    };
    patientNoteRepo = {
      createQueryBuilder: jest.fn(),
    };
    treatmentSessionRepo = {
      createQueryBuilder: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SystemOptionService,
        {
          provide: getRepositoryToken(SystemOption),
          useValue: systemOptionRepo,
        },
        {
          provide: getRepositoryToken(Treatment),
          useValue: treatmentSessionRepo,
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: patientRepo,
        },
        {
          provide: getRepositoryToken(PatientNote),
          useValue: patientNoteRepo,
        },
      ],
    }).compile();

    service = module.get(SystemOptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deactivatePriority', () => {
    it('should reject when option is not PRIORITY type', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce({
        id: 1,
        type: SystemOptionType.COLOR,
        value: 'blue',
      });

      await expect(service.deactivatePriority(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject deactivating priority level 1', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(priorityOption('1', 1));

      await expect(service.deactivatePriority(1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject when patients still use the priority', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(priorityOption('3'));
      patientRepo.find.mockResolvedValueOnce([
        { id: 1, name: 'A', priority: PatientPriority.LEVEL_3 },
      ]);

      try {
        await service.deactivatePriority(5);
        throw new Error('expected HttpException');
      } catch (e) {
        if (e instanceof Error && e.message === 'expected HttpException') {
          throw e;
        }
        expect(e).toBeInstanceOf(HttpException);
        expect((e as HttpException).getStatus()).toBe(HttpStatus.CONFLICT);
        const body = (e as HttpException).getResponse() as {
          blocking_patients: { id: number }[];
        };
        expect(body.blocking_patients).toHaveLength(1);
      }
    });

    it('should deactivate when no patients use the priority', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(priorityOption('4'));
      patientRepo.find.mockResolvedValueOnce([]);

      const result = await service.deactivatePriority(8);

      expect(result.isActive).toBe(false);
      expect(systemOptionRepo.save).toHaveBeenCalled();
    });
  });

  describe('bulkUpdatePatientsPriority', () => {
    it('should throw when patientIds is empty', async () => {
      await expect(
        service.bulkUpdatePatientsPriority({
          patientIds: [],
          priorityCode: '2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when target priority option is missing or inactive', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(null);

      await expect(
        service.bulkUpdatePatientsPriority({
          patientIds: [1],
          priorityCode: '2',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update patients and return affected count', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(priorityOption('2'));

      const result = await service.bulkUpdatePatientsPriority({
        patientIds: [1, 3],
        priorityCode: '2',
      });

      expect(result).toEqual({ updatedCount: 2 });
      expect(patientRepo.update).toHaveBeenCalled();
    });
  });

  describe('update (priority)', () => {
    it('should block is_active false for priority value 1', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(priorityOption('1'));

      await expect(service.update(1, { is_active: false })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should block is_active false when patients use that priority', async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce(priorityOption('3'));
      patientRepo.find.mockResolvedValueOnce([{ id: 9, name: 'X' }]);

      try {
        await service.update(3, { is_active: false });
        throw new Error('expected HttpException');
      } catch (e) {
        if (e instanceof Error && e.message === 'expected HttpException') {
          throw e;
        }
        expect(e).toBeInstanceOf(HttpException);
        const res = (e as HttpException).getResponse() as {
          blocking_patients: unknown[];
        };
        expect(res.blocking_patients).toHaveLength(1);
      }
    });
  });

  describe('getUsageCount', () => {
    it('should count notes for NOTE_CATEGORY options', async () => {
      patientNoteRepo.createQueryBuilder.mockReturnValue(qb({ total: '4' }));
      const option = {
        id: 1,
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'general',
      } as SystemOption;

      const count = await service.getUsageCount(option);

      expect(count).toBe(4);
    });
  });

  describe('delete', () => {
    it("should block deleting default 'general' note category", async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce({
        id: 11,
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'general',
      });

      await expect(service.delete(11)).rejects.toThrow(BadRequestException);
      expect(systemOptionRepo.remove).not.toHaveBeenCalled();
    });

    it('should delete non-default options', async () => {
      const option = {
        id: 12,
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'treatment',
      } as SystemOption;
      systemOptionRepo.findOne.mockResolvedValueOnce(option);

      await service.delete(12);

      expect(systemOptionRepo.remove).toHaveBeenCalledWith(option);
    });

    it("should also block deleting legacy default 'general' note category", async () => {
      systemOptionRepo.findOne.mockResolvedValueOnce({
        id: 13,
        type: SystemOptionType.NOTE_CATEGORY,
        value: 'general',
      });

      await expect(service.delete(13)).rejects.toThrow(BadRequestException);
      expect(systemOptionRepo.remove).not.toHaveBeenCalled();
    });
  });
});
