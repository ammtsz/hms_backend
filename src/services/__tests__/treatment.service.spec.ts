import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TreatmentService } from '../treatment.service';
import { Treatment, TreatmentType, TreatmentPlanStatus } from '../../entities/treatment.entity';
import {
  Session,
  SessionAttendanceStatus,
} from '../../entities/session.entity';
import { Consultation } from '../../entities/consultation.entity';
import { Attendance } from '../../entities/attendance.entity';
import { Patient } from '../../entities/patient.entity';
import { AttendanceService } from '../attendance.service';
import { UpdateTreatmentDto } from '../../dtos/treatment.dto';
describe('TreatmentService', () => {
  let service: TreatmentService;

  const createMockSession = (overrides: Partial<Treatment> = {}): Treatment =>
    ({
      id: 1,
      consultation_id: 1,
      attendance_id: 1,
      patient_id: 1,
      treatment_type: TreatmentType.PHYSIOTHERAPY,
      body_location: 'head',
      start_date: '2025-01-15',
      planned_sessions: 5,
      completed_sessions: 0,
      status: TreatmentPlanStatus.SCHEDULED,
      duration_minutes: 2,
      color: 'blue',
      sessions: [],
      created_date: '2025-01-01',
      created_time: '10:00:00',
      updated_date: '2025-01-01',
      updated_time: '10:00:00',
      ...overrides,
    }) as Treatment;

  const mockFindOne = jest.fn();
  const mockSave = jest.fn();

  beforeEach(async () => {
    mockFindOne.mockReset();
    mockSave.mockReset();
    mockSave.mockImplementation((entity: Treatment) => Promise.resolve({ ...entity }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreatmentService,
        {
          provide: getRepositoryToken(Treatment),
          useValue: {
            findOne: mockFindOne,
            save: mockSave,
            create: jest.fn().mockImplementation((dto) => dto),
            find: jest.fn().mockResolvedValue([]),
            createQueryBuilder: jest.fn().mockReturnValue({
              leftJoinAndSelect: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              orWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockResolvedValue([]),
            }),
          },
        },
        {
          provide: getRepositoryToken(Session),
          useValue: { save: jest.fn(), find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Consultation),
          useValue: { findOne: jest.fn().mockResolvedValue(null), find: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: getRepositoryToken(Attendance),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: { findOne: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: AttendanceService,
          useValue: {
            cancelOpenAttendancesByIds: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<TreatmentService>(TreatmentService);
  });

  describe('updateTreatment', () => {
    it('should update notes only when no config edit', async () => {
      const session = createMockSession({ notes: 'old' });
      mockFindOne.mockResolvedValue(session);

      const dto: UpdateTreatmentDto = { notes: 'Updated notes' };
      await service.updateTreatment(1, dto);

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          notes: 'Updated notes',
        }),
      );
    });

    it('should allow body_location, duration_minutes, color when no treatment session is completed', async () => {
      const session = createMockSession({
        sessions: [
          { id: 1, status: SessionAttendanceStatus.SCHEDULED } as Session,
        ],
      });
      mockFindOne.mockResolvedValue(session);

      const dto: UpdateTreatmentDto = {
        body_location: 'back',
        duration_minutes: 3,
        color: 'green',
      };
      await service.updateTreatment(1, dto);

      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({
          body_location: 'back',
          duration_minutes: 3,
          color: 'green',
        }),
      );
    });

    it('should throw BadRequestException when config edit and a treatment session is completed', async () => {
      const session = createMockSession({
        sessions: [
          { id: 1, status: SessionAttendanceStatus.COMPLETED } as Session,
        ],
      });
      mockFindOne.mockResolvedValue(session);

      const dto: UpdateTreatmentDto = { body_location: 'back' };

      await expect(service.updateTreatment(1, dto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.updateTreatment(1, dto)).rejects.toThrow(
        'já possui uma sessão finalizada',
      );
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when tens session receives duration_minutes or color', async () => {
      const session = createMockSession({
        treatment_type: TreatmentType.TENS,
        duration_minutes: null,
        color: null,
        sessions: [],
      });
      mockFindOne.mockResolvedValue(session);

      await expect(
        service.updateTreatment(1, { color: 'blue' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.updateTreatment(1, { duration_minutes: 2 }),
      ).rejects.toThrow(BadRequestException);
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when treatment does not exist', async () => {
      mockFindOne.mockResolvedValue(null);

      await expect(
        service.updateTreatment(999, { notes: 'x' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
