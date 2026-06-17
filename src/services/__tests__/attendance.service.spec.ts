import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceService } from '../attendance.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Attendance } from '../../entities/attendance.entity';
import { Patient } from '../../entities/patient.entity';
import { CreateAttendanceDto } from '../../dtos/attendance.dto';
import { AttendanceType, AttendanceStatus, PatientStatus } from '../../common/enums';
import { ScheduleSetting } from '../../entities/schedule-setting.entity';
import { Repository, DeleteResult } from 'typeorm';
import {
  ResourceNotFoundException,
  InvalidAttendanceStatusTransitionException,
  AttendanceTimeSlotUnavailableException,
} from '../../common/exceptions';
import { BadRequestException } from '@nestjs/common';
import { SessionService } from '../session.service';
import { TreatmentService } from '../treatment.service';
import { HolidayService } from '../holiday.service';
import { DayFinalizationService } from '../day-finalization.service';
import { DayFinalization } from '../../entities/day-finalization.entity';
import { SessionResponseDto } from '../../dtos/session.dto';
import { SessionAttendanceStatus } from '../../entities/session.entity';

function mockSessionResponseDto(
  overrides: Partial<SessionResponseDto> & Pick<SessionResponseDto, 'id'>,
): SessionResponseDto {
  return {
    treatment_id: 1,
    session_number: 1,
    scheduled_date: '2026-02-20',
    status: SessionAttendanceStatus.SCHEDULED,
    created_date: '2026-01-01',
    created_time: '00:00:00',
    updated_date: '2026-01-01',
    updated_time: '00:00:00',
    ...overrides,
  };
}

describe('AttendanceService', () => {
  let service: AttendanceService;
  let repository: Repository<Attendance>;
  let module: TestingModule;

  const mockAttendance = {
    id: 1,
    patient_id: 1,
    patient: null,
    type: AttendanceType.ASSESSMENT,
    status: AttendanceStatus.SCHEDULED,
    scheduled_date: '2025-07-22',
    scheduled_time: '14:30',
    notes: 'Test notes',
    absence_justified: null,
    absence_notes: null,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
    checked_in_time: null,
    started_time: null,
    completed_time: null,
    cancelled_date: null,
    cancelled_time: null,
  } as Attendance;

  const mockQueryBuilder = {
    select: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(), // Add missing addOrderBy method
    offset: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([
      {
        id: 1,
        patient_name: 'John Doe',
        scheduled_date: '2025-07-22',
        scheduled_time: '14:00:00',
        status: 'scheduled',
        type: 'assessment',
      },
    ]),
    getOne: jest.fn().mockResolvedValue({
      scheduled_date: new Date('2025-07-23'),
    }),
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    whereInIds: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue({ affected: 3 }),
  };

  const mockRepository = {
    save: jest.fn().mockResolvedValue(mockAttendance), // Fix save to return the attendance
    find: jest.fn().mockResolvedValue([mockAttendance]),
    findOne: jest.fn().mockResolvedValue(mockAttendance),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    merge: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockReturnValue(mockAttendance),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findByIds: jest.fn().mockResolvedValue([mockAttendance]), // Add findByIds mock for bulkUpdateStatus
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AttendanceService,
        {
          provide: getRepositoryToken(Attendance),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ScheduleSetting),
          useValue: {
            findOne: jest.fn().mockResolvedValue({ max_daily_attendances: 10 }),
          },
        },
        {
          provide: SessionService,
          useValue: {
            rescheduleSession: jest.fn(),
            markSessionMissed: jest.fn(),
            getSessionsByAttendance: jest.fn().mockResolvedValue([]),
            getSessionsForReschedule: jest.fn().mockResolvedValue([]),
            cancelSessionsByAttendanceId: jest.fn().mockResolvedValue(undefined),
            getMaxScheduledDateForTreatment: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: TreatmentService,
          useValue: {
            getTreatmentsByPatient: jest.fn().mockResolvedValue([]),
            getSessionWithReturnConfig: jest.fn().mockResolvedValue(null),
            getTreatmentIdsByConsultationId: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: HolidayService,
          useValue: {
            isHolidayForTreatment: jest.fn().mockResolvedValue(false),
          },
        },
        {
          provide: DayFinalizationService,
          useValue: {
            getFinalizationStatus: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
    repository = module.get<Repository<Attendance>>(
      getRepositoryToken(Attendance),
    );
  });

  afterEach(() => {
    // Reset findOne default so tests that mock it (create, validateScheduling) don't leak
    const findOneMock = repository.findOne as jest.Mock;
    if (findOneMock.mockResolvedValue) {
      findOneMock.mockResolvedValue(mockAttendance);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new attendance', async () => {
      const createDto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      // No open root assessment so validateScheduling passes the open-root check
      const findOneSpy = jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(null);

      const result = await service.create(createDto);

      expect(result).toMatchObject({
        id: expect.any(Number),
        patient_id: createDto.patient_id,
        type: createDto.type,
        scheduled_date: createDto.scheduled_date, // scheduled_date is a string
        scheduled_time: createDto.scheduled_time,
        notes: createDto.notes,
      });
      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();

      findOneSpy.mockRestore();
    });
  });

  describe('findAll', () => {
    it('should return an array of attendances', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockAttendance]);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('findEligibleParentOptions', () => {
    it('should return eligible root assessment attendances with options', async () => {
      const rootAttendance = {
        ...mockAttendance,
        id: 10,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        parent_attendance_id: null,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        consultation: {
          patient_status: 'T',
          main_complaint: 'Dor nas costas',
        },
      } as unknown as Attendance;

      jest.spyOn(repository, 'find').mockResolvedValueOnce([rootAttendance]);

      const result = await service.findEligibleParentOptions(1);

      expect(repository.find).toHaveBeenCalledWith({
        where: { patient_id: 1 },
        relations: ['consultation'],
        order: { scheduled_date: 'ASC', scheduled_time: 'ASC' },
      });
      expect(result.options).toHaveLength(1);
      expect(result.options[0]).toMatchObject({
        id: 10,
        date: '2025-07-22',
        main_complaint: 'Dor nas costas',
      });
      expect(result.options[0].label).toMatch(/ - Dor nas costas$/);
    });

    it('should exclude roots whose chain has patient_status A or F', async () => {
      const rootWithAlta = {
        ...mockAttendance,
        id: 1,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        parent_attendance_id: null,
        scheduled_date: '2025-07-20',
        consultation: { patient_status: 'A', main_complaint: 'Alta' },
      } as unknown as Attendance;
      const rootOngoing = {
        ...mockAttendance,
        id: 2,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        parent_attendance_id: null,
        scheduled_date: '2025-07-22',
        consultation: {
          patient_status: 'T',
          main_complaint: 'Dor nas costas',
        },
      } as unknown as Attendance;

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([rootWithAlta, rootOngoing]);

      const result = await service.findEligibleParentOptions(1);

      expect(result.options).toHaveLength(1);
      expect(result.options[0].id).toBe(2);
      expect(result.options[0].main_complaint).toBe('Dor nas costas');
    });

    it('should return empty options when patient has no assessment roots', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce([]);

      const result = await service.findEligibleParentOptions(1);

      expect(result.options).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a single attendance', async () => {
      const result = await service.findOne(1);

      expect(result).toEqual(mockAttendance);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['patient'],
      });
    });
  });

  describe('syncStatusFromSession', () => {
    it('should update attendance status without running side effects', async () => {
      const savedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.COMPLETED,
        completed_time: '10:30:00',
      };
      mockRepository.save.mockResolvedValueOnce(savedAttendance);

      const result = await service.syncStatusFromSession(
        1,
        AttendanceStatus.COMPLETED,
      );

      expect(result.status).toBe(AttendanceStatus.COMPLETED);
      expect(repository.merge).toHaveBeenCalledWith(
        mockAttendance,
        expect.objectContaining({
          status: AttendanceStatus.COMPLETED,
          updated_date: expect.any(String),
          updated_time: expect.any(String),
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should set cancelled_date and absence_notes when status is CANCELLED', async () => {
      const savedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.CANCELLED,
        cancelled_date: '2025-07-22',
        cancelled_time: '10:00:00',
        absence_notes: 'Reason',
      };
      mockRepository.save.mockResolvedValueOnce(savedAttendance);

      await service.syncStatusFromSession(
        1,
        AttendanceStatus.CANCELLED,
        { cancellationReason: 'Reason' },
      );

      expect(repository.merge).toHaveBeenCalledWith(
        mockAttendance,
        expect.objectContaining({
          status: AttendanceStatus.CANCELLED,
          cancelled_date: expect.any(String),
          cancelled_time: expect.any(String),
          absence_notes: 'Reason',
        }),
      );
    });
  });

  describe('update', () => {
    it('should update an attendance', async () => {
      const updateDto = { notes: 'Updated notes' };

      await service.update(1, updateDto);

      // Update method adds updated_date and updated_time automatically
      expect(repository.merge).toHaveBeenCalledWith(
        mockAttendance,
        expect.objectContaining({
          notes: 'Updated notes',
          updated_date: expect.any(String),
          updated_time: expect.any(String),
        })
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['patient'],
      });
    });

    it('should increment missing streak only once per patient per day', async () => {
      const patientRepo = module.get<Repository<Patient>>(
        getRepositoryToken(Patient),
      );

      const patient: Patient = {
        id: 1,
        name: 'John Doe',
        phone: null,
        priority: null,
        patient_status: null,
        birth_date: null,
        main_complaint: null,
        start_date: '2025-01-01',
        discharge_date: null,
        missing_appointments_streak: 0,
        timezone: 'America/Sao_Paulo',
        created_date: '2025-01-01',
        created_time: '09:00:00',
        updated_date: '2025-01-01',
        updated_time: '09:00:00',
      };

      jest.spyOn(patientRepo, 'findOne').mockResolvedValue(patient);
      const saveSpy = jest.spyOn(patientRepo, 'save').mockResolvedValue(patient);

      const att1: Attendance = {
        ...mockAttendance,
        id: 1,
        patient_id: 1,
        scheduled_date: '2025-07-22',
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;
      const att2: Attendance = {
        ...mockAttendance,
        id: 2,
        patient_id: 1,
        scheduled_date: '2025-07-22',
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(att1)
        .mockResolvedValueOnce(att2);

      jest
        .spyOn(repository, 'save')
        .mockResolvedValueOnce({
          ...att1,
          status: AttendanceStatus.MISSED,
          absence_justified: false,
        } as Attendance)
        .mockResolvedValueOnce({
          ...att2,
          status: AttendanceStatus.MISSED,
          absence_justified: false,
        } as Attendance);

      // 1st update:
      // - completedSameDayCount = 0
      // - otherUnjustifiedMissedSameDayCount = 0 -> increment
      // 2nd update:
      // - completedSameDayCount = 0
      // - otherUnjustifiedMissedSameDayCount = 1 -> skip increment
      jest
        .spyOn(repository, 'count')
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(1);

      await service.update(1, {
        status: AttendanceStatus.MISSED,
        absence_justified: false,
      });
      await service.update(2, {
        status: AttendanceStatus.MISSED,
        absence_justified: false,
      });

      expect(patient.missing_appointments_streak).toBe(1);
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('should cancel an attendance by changing status to CANCELLED', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockAttendance);
      jest.spyOn(repository, 'save').mockResolvedValueOnce({
        ...mockAttendance,
        status: AttendanceStatus.CANCELLED,
      } as Attendance);

      await service.cancel(1, 'Test cancellation');

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AttendanceStatus.CANCELLED,
          absence_notes: 'Test cancellation',
          absence_justified: true,
        })
      );
    });

    it('should throw ResourceNotFoundException when attendance not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.cancel(999)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('validateScheduling', () => {
    let scheduleSettingRepository: Repository<ScheduleSetting>;
    let patientRepository: Repository<Patient>;

    beforeEach(() => {
      scheduleSettingRepository = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );
      patientRepository = module.get<Repository<Patient>>(
        getRepositoryToken(Patient),
      );
      // Default: no open root assessment (so create flow can reach later validations or success)
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
      // Default NEW_PATIENT so assessment create without parent can reach schedule/day validations;
      // override to IN_TREATMENT in tests that assert parent-attendance rules for "em tratamento".
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.NEW_PATIENT,
      } as Patient);
    });

    afterEach(() => {
      // Restore findOne so other describes (e.g. findOne, update) are not affected
      (repository.findOne as jest.Mock).mockRestore?.();
    });

    it('should throw BadRequestException when no scheduling settings available', async () => {
      jest
        .spyOn(scheduleSettingRepository, 'findOne')
        .mockResolvedValueOnce(null);

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        'Não há agenda disponível para esta data. Escolha outro dia.',
      );
    });

    it('should throw AttendanceTimeSlotUnavailableException when time is outside operational hours', async () => {
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '12:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        AttendanceTimeSlotUnavailableException,
      );
    });

    it('should throw AttendanceTimeSlotUnavailableException when maximum concurrent appointments reached', async () => {
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      jest
        .spyOn(repository, 'count')
        .mockImplementation((options: unknown) => {
          const where = (options as { where?: { type?: AttendanceType; status?: AttendanceStatus } }).where;

          // Concurrent slot count for assessment attendances
          if (
            where?.type === AttendanceType.ASSESSMENT &&
            where.status === AttendanceStatus.SCHEDULED
          ) {
            return Promise.resolve(2);
          }

          // Default to 0 for other count calls (e.g., completed root or duplicate checks)
          return Promise.resolve(0);
        });

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        AttendanceTimeSlotUnavailableException,
      );
    });

    it('should throw BadRequestException when scheduling on a finalized day', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const dayFinalizationService = module.get(DayFinalizationService);
      jest
        .spyOn(dayFinalizationService, 'getFinalizationStatus')
        .mockResolvedValue({ finalization_date: '2025-07-22' } as DayFinalization);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Dia já finalizado. Não é mais possível agendar atendimentos para este dia.',
      );
    });

    it('should throw BadRequestException when no parent_attendance_id but patient has completed root assessment attendance', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        // parent_attendance_id omitted - frontend sent "first attendance"
      };

      jest.spyOn(repository, 'count').mockResolvedValue(1); // patient has 1 completed root

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toMatch(/Selecione a queixa principal \(consulta anterior\) relacionada a este agendamento./);
    });

    it('should throw BadRequestException when IN_TREATMENT patient schedules assessment without parent (even if no completed root row)', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.IN_TREATMENT,
      } as Patient);
      jest.spyOn(repository, 'count').mockResolvedValue(0);

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toMatch(/Selecione a queixa principal \(consulta anterior\) relacionada a este agendamento./);
    });

    it('should reject parent_attendance_id when patient is DISCHARGED (A)', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.DISCHARGED,
      } as Patient);

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_attendance_id: 10,
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Queixa principal desatualizada/,
      );
    });

    it('should reject parent_attendance_id when patient is ABSENT (F)', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.ABSENT,
      } as Patient);

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_attendance_id: 10,
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Queixa principal desatualizada/,
      );
    });

    it('should reject parent_attendance_id when patient is NEW_PATIENT (N)', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.NEW_PATIENT,
      } as Patient);

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_attendance_id: 10,
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Queixa principal desatualizada/,
      );
    });

    it('should allow assessment with parent_attendance_id when patient is IN_TREATMENT and parent is eligible root', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.IN_TREATMENT,
      } as Patient);

      const rootParent = {
        id: 10,
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        parent_attendance_id: null,
        scheduled_date: '2025-07-01',
        scheduled_time: '09:00:00',
        status: AttendanceStatus.COMPLETED,
        consultation: null,
      } as Attendance;

      jest.spyOn(repository, 'findOne').mockImplementation((opts) => {
        const w = opts?.where as { id?: number } | undefined;
        if (w?.id === 10) {
          return Promise.resolve(rootParent);
        }
        return Promise.resolve(null);
      });

      jest.spyOn(repository, 'find').mockResolvedValue([rootParent]);

      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      jest.spyOn(repository, 'count').mockResolvedValue(0);

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_attendance_id: 10,
      };

      await expect(service.create(dto)).resolves.toBeDefined();
    });

    it('should allow assessment attendance without parent_attendance_id for DISCHARGED or ABSENT patient', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        patient_status: PatientStatus.DISCHARGED,
      } as Patient);
      await expect(service.create(dto)).resolves.toBeDefined();

      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        patient_status: PatientStatus.ABSENT,
      } as Patient);
      await expect(service.create(dto)).resolves.toBeDefined();
    });

    it('should throw BadRequestException when DISCHARGED patient has open root assessment and tries another without parent', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        patient_status: PatientStatus.DISCHARGED,
      } as Patient);

      const openRootWithPatient = {
        ...mockAttendance,
        scheduled_date: '2025-07-15',
        patient: { id: 1, name: 'Maria Silva' } as Patient,
      };
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(openRootWithPatient as Attendance);

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toContain(
        'Conclua esta consulta antes de agendar uma nova.',
      );
    });

    it('should throw BadRequestException when no parent_attendance_id and patient has open root assessment attendance', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.IN_TREATMENT,
      } as Patient);
      jest.spyOn(repository, 'count').mockResolvedValueOnce(0); // completed root = 0
      const openRootWithPatient = {
        ...mockAttendance,
        scheduled_date: '2025-07-15',
        patient: { id: 1, name: 'Maria Silva' } as Patient,
      };
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(openRootWithPatient as Attendance);

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toContain(
        'Conclua esta consulta antes de agendar uma nova.',
      );
      expect(thrown?.message).toContain('Maria Silva');
      expect(thrown?.message).toContain('15/07/2025'); // formatDateBR('2025-07-15')
    });

    it('should throw BadRequestException when patient already has attendance for same date and type', async () => {
      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const dayFinalizationService = module.get(DayFinalizationService);
      jest.spyOn(dayFinalizationService, 'getFinalizationStatus').mockResolvedValue(null);
      const holidayService = module.get(HolidayService);
      jest.spyOn(holidayService, 'isHolidayForTreatment').mockResolvedValue(false);
      jest.spyOn(repository, 'count').mockImplementation((options: any) => {
        if (options?.where?.scheduled_date === '2025-07-22' && options?.where?.patient_id === 1)
          return Promise.resolve(1);
        return Promise.resolve(0);
      });
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Este paciente já possui consulta agendada para esta data.',
      );
    });

    it('should allow assessment attendance without parent_attendance_id for NEW_PATIENT when patient has no completed root', async () => {
      const createDto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      jest.spyOn(repository, 'count').mockResolvedValue(0); // no completed roots

      const result = await service.create(createDto);

      expect(result).toMatchObject({
        patient_id: createDto.patient_id,
        type: createDto.type,
        scheduled_date: createDto.scheduled_date,
        scheduled_time: createDto.scheduled_time,
      });
    });
  });

  describe('validateTreatmentSlotsForDates', () => {
    let scheduleSettingRepository: Repository<ScheduleSetting>;

    beforeEach(() => {
      scheduleSettingRepository = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );
    });

    it('should not throw when all dates have active setting with max_concurrent_physiotherapy_tens > 0', async () => {
      jest.spyOn(scheduleSettingRepository, 'findOne').mockImplementation((opts: any) => {
        const dayOfWeek = opts?.where?.day_of_week;
        return Promise.resolve({
          id: 1,
          day_of_week: dayOfWeek,
          is_active: true,
          max_concurrent_physiotherapy_tens: 2,
        } as ScheduleSetting);
      });

      await expect(
        service.validateTreatmentSlotsForDates(['2025-07-22', '2025-07-29']),
      ).resolves.toBeUndefined();
    });

    it('should throw BadRequestException when a date has no schedule setting', async () => {
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.validateTreatmentSlotsForDates(['2025-07-22']),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.validateTreatmentSlotsForDates(['2025-07-22']),
      ).rejects.toThrow(/não possuem vagas para tratamentos/);
    });

    it('should throw BadRequestException when a date has inactive setting', async () => {
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        is_active: false,
        max_concurrent_physiotherapy_tens: 2,
      } as ScheduleSetting);

      await expect(
        service.validateTreatmentSlotsForDates(['2025-07-22']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when max_concurrent_physiotherapy_tens is 0', async () => {
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        is_active: true,
        max_concurrent_physiotherapy_tens: 0,
      } as ScheduleSetting);

      await expect(
        service.validateTreatmentSlotsForDates(['2025-07-22']),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not throw when dateStrings is empty', async () => {
      await expect(
        service.validateTreatmentSlotsForDates([]),
      ).resolves.toBeUndefined();
      expect(scheduleSettingRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('isDateAvailableForScheduling', () => {
    const testDate = '2025-07-22';

    beforeEach(() => {
      const scheduleSettingRepository = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );
      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValue({
        id: 1,
        day_of_week: 2,
        is_active: true,
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 2,
      } as ScheduleSetting);
      jest.spyOn(repository, 'find').mockResolvedValue([]);
    });

    it('returns false for physiotherapy when another open attendance has same body location and color', async () => {
      const sessionService = module.get<SessionService>(SessionService);
      jest.spyOn(repository, 'find').mockImplementation((args) => {
        const w = args as { where?: { patient_id?: number } };
        if (w?.where?.patient_id != null) {
          return Promise.resolve([{ id: 10 } as Attendance]);
        }
        return Promise.resolve([]);
      });
      jest
        .spyOn(sessionService, 'getSessionsByAttendance')
        .mockImplementation((attendanceId: number) => {
          if (attendanceId === 99) {
            return Promise.resolve([
              {
                body_location: 'Cervical',
                color: 'Azul',
              },
            ]);
          }
          if (attendanceId === 10) {
            return Promise.resolve([
              {
                body_location: 'Cervical',
                color: 'Azul',
              },
            ]);
          }
          return Promise.resolve([]);
        });

      const result = await service.isDateAvailableForScheduling(
        testDate,
        AttendanceType.PHYSIOTHERAPY,
        { patientId: 1, originalAttendanceId: 99, scheduledTime: '09:00:00' },
      );

      expect(result).toBe(false);
    });

    it('returns true for physiotherapy when other attendance has same location but different color', async () => {
      const sessionService = module.get<SessionService>(SessionService);
      jest.spyOn(repository, 'find').mockImplementation((args) => {
        const w = args as { where?: { patient_id?: number } };
        if (w?.where?.patient_id != null) {
          return Promise.resolve([{ id: 10 } as Attendance]);
        }
        return Promise.resolve([]);
      });
      jest
        .spyOn(sessionService, 'getSessionsByAttendance')
        .mockImplementation((attendanceId: number) => {
          if (attendanceId === 99) {
            return Promise.resolve([
              { body_location: 'Cervical', color: 'Azul' },
            ]);
          }
          if (attendanceId === 10) {
            return Promise.resolve([
              { body_location: 'Cervical', color: 'Vermelho' },
            ]);
          }
          return Promise.resolve([]);
        });

      const result = await service.isDateAvailableForScheduling(
        testDate,
        AttendanceType.PHYSIOTHERAPY,
        { patientId: 1, originalAttendanceId: 99, scheduledTime: '09:00:00' },
      );

      expect(result).toBe(true);
    });
  });

  describe('validateStatusTransition', () => {
    it('should throw InvalidAttendanceStatusTransitionException for invalid status transition', async () => {
      const updateDto = {
        status: AttendanceStatus.COMPLETED,
        notes: 'Updated notes',
      };

      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAttendance);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAttendanceStatusTransitionException,
      );
    });

    it('should allow valid status transition', async () => {
      const updateDto = {
        status: AttendanceStatus.CHECKED_IN,
        notes: 'Updated notes',
      };

      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow MISSED to MISSED status transition for updating absence notes', async () => {
      const updateDto = {
        status: AttendanceStatus.MISSED,
        absence_notes: 'Updated absence reason',
        absence_justified: false,
      };

      const mockMissedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.MISSED,
        absence_notes: 'Original absence reason',
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockMissedAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('cancel (soft delete)', () => {
    it('should cancel an attendance by setting status to CANCELLED', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockAttendance);
      jest.spyOn(repository, 'save').mockResolvedValueOnce({
        ...mockAttendance,
        status: AttendanceStatus.CANCELLED,
      } as Attendance);

      await service.cancel(1);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AttendanceStatus.CANCELLED,
        })
      );
    });

    it('should throw ResourceNotFoundException when attendance not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      await expect(service.cancel(999)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    it('should throw InvalidAttendanceStatusTransitionException when trying to cancel completed attendance', async () => {
      const completedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.COMPLETED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(completedAttendance);

      await expect(service.cancel(1)).rejects.toThrow(
        InvalidAttendanceStatusTransitionException,
      );
    });

    it('should throw InvalidAttendanceStatusTransitionException when trying to cancel missed attendance', async () => {
      const missedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.MISSED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(missedAttendance);

      await expect(service.cancel(1, 'Faltas consecutivas')).rejects.toThrow(
        InvalidAttendanceStatusTransitionException,
      );
    });
  });

  describe('findOpenAttendancesByPatientId and cancelOpenAttendancesForPatient', () => {
    it('findOpenAttendancesByPatientId should only return scheduled, checked_in, in_progress', async () => {
      const scheduled = { ...mockAttendance, id: 1, status: AttendanceStatus.SCHEDULED };
      const checkedIn = { ...mockAttendance, id: 2, status: AttendanceStatus.CHECKED_IN };
      jest.spyOn(repository, 'find').mockResolvedValueOnce([scheduled, checkedIn] as Attendance[]);

      const result = await service.findOpenAttendancesByPatientId(1);

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patient_id: 1,
            status: expect.anything(),
          }),
        }),
      );
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.status)).toEqual([AttendanceStatus.SCHEDULED, AttendanceStatus.CHECKED_IN]);
    });

    it('cancelOpenAttendancesForPatient should only cancel scheduled, checked_in, in_progress (never missed)', async () => {
      const scheduledAtt = { ...mockAttendance, id: 10, status: AttendanceStatus.SCHEDULED, scheduled_date: '2025-02-01', type: 'assessment' };
      const missedAtt = { ...mockAttendance, id: 20, status: AttendanceStatus.MISSED, scheduled_date: '2025-01-15', type: 'assessment' };
      // Simulate find returning both (e.g. if query were wrong): defensive filter must exclude MISSED
      jest.spyOn(repository, 'find').mockResolvedValueOnce([scheduledAtt, missedAtt] as Attendance[]);
      const cancelSpy = jest.spyOn(service, 'cancel').mockResolvedValueOnce(undefined);

      const result = await service.cancelOpenAttendancesForPatient(1, 'Faltas consecutivas');

      // Only the SCHEDULED attendance should be cancelled (defensive filter excludes MISSED)
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith(10, 'Faltas consecutivas');
      expect(result).toEqual([{ id: 10, type: 'assessment', scheduled_date: '2025-02-01' }]);
    });

    it('cancelOpenAttendancesForPatient should exclude given attendance IDs (e.g. just-completed)', async () => {
      const completedAtt = { ...mockAttendance, id: 10, status: AttendanceStatus.IN_PROGRESS, scheduled_date: '2025-02-01', type: 'assessment' };
      const scheduledAtt = { ...mockAttendance, id: 20, status: AttendanceStatus.SCHEDULED, scheduled_date: '2025-02-15', type: 'assessment' };
      jest.spyOn(repository, 'find').mockResolvedValueOnce([completedAtt, scheduledAtt] as Attendance[]);
      const cancelSpy = jest.spyOn(service, 'cancel').mockResolvedValueOnce(undefined);

      const result = await service.cancelOpenAttendancesForPatient(1, 'Alta médica', {
        excludeAttendanceIds: [10],
      });

      // Only attendance 20 should be cancelled; 10 is excluded
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith(20, 'Alta médica');
      expect(result).toEqual([{ id: 20, type: 'assessment', scheduled_date: '2025-02-15' }]);
    });

    it('cancelOpenAttendancesByIds should only cancel open statuses (never missed or completed)', async () => {
      const scheduledAtt = { ...mockAttendance, id: 10, status: AttendanceStatus.SCHEDULED, scheduled_date: '2025-02-01', type: 'assessment' };
      const missedAtt = { ...mockAttendance, id: 20, status: AttendanceStatus.MISSED, scheduled_date: '2025-01-15', type: 'assessment' };
      jest.spyOn(repository, 'find').mockResolvedValueOnce([scheduledAtt, missedAtt] as Attendance[]);
      const cancelSpy = jest.spyOn(service, 'cancel').mockResolvedValueOnce(undefined);

      const result = await service.cancelOpenAttendancesByIds([10, 20], 'Session cancelled');

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith(10, 'Session cancelled');
      expect(result).toEqual([{ id: 10, type: 'assessment', scheduled_date: '2025-02-01' }]);
    });
  });

  describe('update', () => {
    it('should update attendance without status change', async () => {
      const updateDto = {
        notes: 'Updated notes only',
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockAttendance);

      await service.update(1, updateDto);

      expect(repository.merge).toHaveBeenCalledWith(
        mockAttendance,
        expect.objectContaining({
          notes: 'Updated notes only',
          updated_date: expect.any(String),
          updated_time: expect.any(String),
        })
      );
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('validateScheduling edge cases', () => {
    beforeEach(() => {
      // No open root assessment so assessment create in this block can pass that check
      jest.spyOn(repository, 'findOne').mockResolvedValue(null);
    });

    it('should handle physiotherapy type when checking concurrent appointments', async () => {
      const scheduleSettingRepository = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );

      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 1,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      jest
        .spyOn(repository, 'count')
        .mockImplementation((options: unknown) => {
          const where = (options as { where?: { type?: AttendanceType; status?: AttendanceStatus } }).where;

          // Concurrent slot count for physiotherapy attendances
          if (
            where?.type === AttendanceType.PHYSIOTHERAPY &&
            where.status === AttendanceStatus.SCHEDULED
          ) {
            return Promise.resolve(1);
          }

          // Default to 0 for other count calls (e.g., completed root or duplicate checks)
          return Promise.resolve(0);
        });

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.PHYSIOTHERAPY,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        AttendanceTimeSlotUnavailableException,
      );
    });

    it('should allow creation when concurrent count is under limit', async () => {
      const scheduleSettingRepository = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );

      jest.spyOn(scheduleSettingRepository, 'findOne').mockResolvedValueOnce({
        id: 1,
        day_of_week: 2,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 3,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
        created_date: '2025-07-22',
        created_time: '09:00:00',
        updated_date: '2025-07-22',
        updated_time: '09:00:00',
      } as ScheduleSetting);

      jest
        .spyOn(repository, 'count')
        .mockImplementation((options: unknown) => {
          const where = (options as { where?: { type?: AttendanceType; status?: AttendanceStatus } }).where;

          // Concurrent slot count below limit for assessment attendances
          if (
            where?.type === AttendanceType.ASSESSMENT &&
            where.status === AttendanceStatus.SCHEDULED
          ) {
            return Promise.resolve(1);
          }

          // Default to 0 for other count calls (e.g., completed root or duplicate checks)
          return Promise.resolve(0);
        });

      const dto: CreateAttendanceDto = {
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const result = await service.create(dto);
      expect(result).toBeDefined();
    });
  });

  describe('findOne error cases', () => {
    it('should throw ResourceNotFoundException when attendance not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('additional status transition tests', () => {
    it('should allow transition from CHECKED_IN to IN_PROGRESS', async () => {
      const updateDto = {
        status: AttendanceStatus.IN_PROGRESS,
        notes: 'Starting treatment',
      };

      const mockCheckedInAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.CHECKED_IN,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCheckedInAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from IN_PROGRESS to COMPLETED', async () => {
      const updateDto = {
        status: AttendanceStatus.COMPLETED,
        notes: 'Treatment completed successfully',
      };

      const mockInProgressAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.IN_PROGRESS,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockInProgressAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from SCHEDULED to CANCELLED', async () => {
      const updateDto = {
        status: AttendanceStatus.CANCELLED,
        notes: 'Patient cancelled appointment',
      };

      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from SCHEDULED to MISSED', async () => {
      const updateDto = {
        status: AttendanceStatus.MISSED,
        notes: 'Patient missed appointment',
      };

      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should reject invalid transition from COMPLETED to SCHEDULED', async () => {
      const updateDto = {
        status: AttendanceStatus.SCHEDULED,
        notes: 'Trying to reschedule completed',
      };

      const mockCompletedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.COMPLETED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCompletedAttendance);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAttendanceStatusTransitionException,
      );
    });

    it('should reject invalid transition from CANCELLED to COMPLETED', async () => {
      const updateDto = {
        status: AttendanceStatus.COMPLETED,
        notes: 'Trying to complete cancelled',
      };

      const mockCancelledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.CANCELLED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCancelledAttendance);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAttendanceStatusTransitionException,
      );
    });

    // Test new bidirectional transitions
    it('should allow transition from CHECKED_IN to COMPLETED (direct completion)', async () => {
      const updateDto = {
        status: AttendanceStatus.COMPLETED,
        notes: 'Direct completion',
      };

      const mockCheckedInAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.CHECKED_IN,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCheckedInAttendance);
      jest.spyOn(repository, 'merge').mockReturnValueOnce(mockCheckedInAttendance);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(mockCheckedInAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from CHECKED_IN to SCHEDULED (moving back)', async () => {
      const updateDto = {
        status: AttendanceStatus.SCHEDULED,
        notes: 'Moving back to scheduled',
      };

      const mockCheckedInAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.CHECKED_IN,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCheckedInAttendance);
      jest.spyOn(repository, 'merge').mockReturnValueOnce(mockCheckedInAttendance);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(mockCheckedInAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should NOT allow transition from COMPLETED to CHECKED_IN (completed is final)', async () => {
      const updateDto = {
        status: AttendanceStatus.CHECKED_IN,
        notes: 'Trying to reopen attendance',
      };

      const mockCompletedAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.COMPLETED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCompletedAttendance);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAttendanceStatusTransitionException,
      );
    });

    it('should allow transition from CANCELLED to SCHEDULED (rescheduling)', async () => {
      const updateDto = {
        status: AttendanceStatus.SCHEDULED,
        notes: 'Rescheduling cancelled appointment',
      };

      const mockCancelledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.CANCELLED,
      } as Attendance;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCancelledAttendance);
      jest.spyOn(repository, 'merge').mockReturnValueOnce(mockCancelledAttendance);
      jest.spyOn(repository, 'save').mockResolvedValueOnce(mockCancelledAttendance);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('findAllForAgenda', () => {
    it('should return raw agenda data without filters', async () => {
      const result = await service.findAllForAgenda();

      expect(result).toEqual([
        {
          id: 1,
          patient_name: 'John Doe',
          scheduled_date: '2025-07-22',
          scheduled_time: '14:00:00',
          status: 'scheduled',
          type: 'assessment',
        },
      ]);
      expect(repository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should apply filters when provided', async () => {
      const filters = {
        statuses: [AttendanceStatus.SCHEDULED],
        type: 'assessment',
        limit: 5,
        fromDate: '2025-07-01',
        toDate: '2025-07-31',
      };

      const mockQueryBuilderForFilters = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            patient_name: 'John Doe',
            scheduled_date: '2025-07-22',
            scheduled_time: '14:00:00',
            status: 'scheduled',
            type: 'assessment',
          },
        ]),
      };
      
      jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(mockQueryBuilderForFilters as any);

      const result = await service.findAllForAgenda(filters);

      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'attendance.status IN (:...statuses)',
        { statuses: [AttendanceStatus.SCHEDULED] }
      );
      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'attendance.type = :type',
        { type: 'assessment' }
      );
      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'attendance.scheduled_date >= :fromDate',
        { fromDate: '2025-07-01' },
      );
      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'attendance.scheduled_date <= :toDate',
        { toDate: '2025-07-31' },
      );
      expect(mockQueryBuilderForFilters.limit).toHaveBeenCalledWith(5);
    });

    it('should apply IN filter for multiple statuses', async () => {
      const mockQueryBuilderForFilters = {
        select: jest.fn().mockReturnThis(),
        leftJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        offset: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(mockQueryBuilderForFilters as any);

      await service.findAllForAgenda({
        statuses: [AttendanceStatus.SCHEDULED, AttendanceStatus.COMPLETED],
      });

      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'attendance.status IN (:...statuses)',
        {
          statuses: [AttendanceStatus.SCHEDULED, AttendanceStatus.COMPLETED],
        },
      );
    });

    it('should handle empty filters', async () => {
      const filters = {};
      const result = await service.findAllForAgenda(filters);

      expect(result).toBeDefined();
      expect(repository.createQueryBuilder).toHaveBeenCalled();
    });
  });

  describe('findNextScheduledDate', () => {
    it('should return next scheduled date as string', async () => {
      // Mock to return string date directly
      const mockQueryBuilderForString = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          scheduled_date: '2025-07-23', // String format
        }),
      };
      
      jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(mockQueryBuilderForString as any);

      const result = await service.findNextScheduledDate();

      expect(result).toBe('2025-07-23');
      expect(repository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should return null when no future attendances found', async () => {
      // Create a new mock that returns null
      const mockQueryBuilderForNull = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      
      jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(mockQueryBuilderForNull as any);

      const result = await service.findNextScheduledDate();

      expect(result).toBeNull();
    });

    it('should handle date string conversion correctly', async () => {
      const mockQueryBuilderForString = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({
          scheduled_date: '2025-07-25', // String format
        }),
      };
      
      jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(mockQueryBuilderForString as any);

      const result = await service.findNextScheduledDate();

      expect(result).toBe('2025-07-25');
    });

    it('should handle errors gracefully', async () => {
      const mockQueryBuilderForError = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockRejectedValue(new Error('Database error')),
      };
      
      jest.spyOn(repository, 'createQueryBuilder').mockReturnValueOnce(mockQueryBuilderForError as any);

      await expect(service.findNextScheduledDate()).rejects.toThrow('Database error');
    });
  });

  describe('getAttendanceStats', () => {
    const mockAttendances = [
      {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
        type: 'assessment',
      },
      {
        ...mockAttendance,
        id: 2,
        status: AttendanceStatus.CHECKED_IN,
        type: 'assessment',
      },
      {
        ...mockAttendance,
        id: 3,
        status: AttendanceStatus.COMPLETED,
        type: 'physiotherapy',
      },
    ];

    it('should return attendance statistics for a date', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce(mockAttendances as any);

      const result = await service.getAttendanceStats('2025-07-22');

      expect(result).toEqual({
        total: 3,
        scheduled: 1,
        checked_in: 1,
        in_progress: 0,
        completed: 1,
        cancelled: 0,
        by_type: { assessment: 2, physiotherapy: 1, tens: 0 },
      });
      expect(repository.find).toHaveBeenCalledWith({
        where: { scheduled_date: '2025-07-22' }, // Service uses string date directly
      });
    });

    it('should return empty stats when no attendances found', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce([]);

      const result = await service.getAttendanceStats('2025-12-25');

      expect(result).toEqual({
        total: 0,
        scheduled: 0,
        checked_in: 0,
        in_progress: 0,
        completed: 0,
        cancelled: 0,
        by_type: { assessment: 0, physiotherapy: 0, tens: 0 },
      });
    });

    it('should handle all attendance statuses correctly', async () => {
      const allStatusAttendances = [
        { ...mockAttendance, status: AttendanceStatus.SCHEDULED, type: 'assessment' },
        { ...mockAttendance, status: AttendanceStatus.CHECKED_IN, type: 'assessment' },
        { ...mockAttendance, status: AttendanceStatus.IN_PROGRESS, type: 'physiotherapy' },
        { ...mockAttendance, status: AttendanceStatus.COMPLETED, type: 'physiotherapy' },
        { ...mockAttendance, status: AttendanceStatus.CANCELLED, type: 'assessment' },
      ];

      jest.spyOn(repository, 'find').mockResolvedValueOnce(allStatusAttendances as any);

      const result = await service.getAttendanceStats('2025-07-22');

      expect(result).toEqual({
        total: 5,
        scheduled: 1,
        checked_in: 1,
        in_progress: 1,
        completed: 1,
        cancelled: 1,
        by_type: { assessment: 3, physiotherapy: 2, tens: 0 },
      });
    });

    it('should use date string directly without conversion', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce([]);

      await service.getAttendanceStats('2025-07-22');

      expect(repository.find).toHaveBeenCalledWith({
        where: { scheduled_date: '2025-07-22' }, // Service uses string directly
      });
    });
  });

  describe('missing_appointments_streak updates', () => {
    const mockPatient = {
      id: 1,
      name: 'John Doe',
      missing_appointments_streak: 0,
    };

    let patientRepository: any;

    beforeEach(() => {
      patientRepository = module.get('PatientRepository');
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue(mockPatient);
      jest.spyOn(patientRepository, 'save').mockResolvedValue(mockPatient);
    });

    it('should increment missing_appointments_streak when marking attendance as MISSED without justification', async () => {
      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      };

      const updateDto = {
        status: AttendanceStatus.MISSED,
        absence_justified: false,
        absence_notes: '',
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);

      expect(patientRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAttendance.patient_id }
      });
      expect(patientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          missing_appointments_streak: 1,
        })
      );
    });

    it('should reset missing_appointments_streak to 0 when marking attendance as MISSED with justification', async () => {
      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      };

      const patientWithStreak = { ...mockPatient, missing_appointments_streak: 2 };
      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce(patientWithStreak);

      const updateDto = {
        status: AttendanceStatus.MISSED,
        absence_justified: true,
        absence_notes: 'Medical emergency',
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);

      expect(patientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          missing_appointments_streak: 0,
        })
      );
    });

    it('should reset missing_appointments_streak to 0 when completing attendance', async () => {
      const patientWithStreak = { ...mockPatient, missing_appointments_streak: 3 };
      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce(patientWithStreak);

      const mockInProgressAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.IN_PROGRESS,
      };

      const updateDto = {
        status: AttendanceStatus.COMPLETED,
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockInProgressAttendance);

      await service.update(1, updateDto);

      expect(patientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          missing_appointments_streak: 0,
        })
      );
    });

    it('should not update missing_appointments_streak for other status changes', async () => {
      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      };

      const updateDto = {
        status: AttendanceStatus.CHECKED_IN,
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);

      // Patient repository should not be called for non-MISSED/COMPLETED statuses
      expect(patientRepository.findOne).not.toHaveBeenCalled();
    });

    it('should handle patient not found gracefully', async () => {
      const mockScheduledAttendance = {
        ...mockAttendance,
        status: AttendanceStatus.SCHEDULED,
      };

      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce(null);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const updateDto = {
        status: AttendanceStatus.MISSED,
        absence_justified: false,
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockScheduledAttendance);

      await service.update(1, updateDto);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Patient 1 not found')
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('findUnresolvedPastDates', () => {
    it('should return empty when no unresolved past attendances exist', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.findUnresolvedPastDates();

      expect(result.hasUnresolved).toBe(false);
      expect(result.dates).toEqual([]);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'attendance.scheduled_date < :today',
        expect.any(Object),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'attendance.status NOT IN (:...resolvedStatuses)',
        {
          resolvedStatuses: [
            AttendanceStatus.COMPLETED,
            AttendanceStatus.CANCELLED,
            AttendanceStatus.MISSED,
          ],
        },
      );
    });

    it('should return correct dates with counts for unresolved attendances', async () => {
      const mockUnresolvedData = [
        {
          date: '2026-01-28',
          count: '3',
          statuses: ['scheduled', 'checked_in'],
        },
        {
          date: '2026-01-30',
          count: '2',
          statuses: ['scheduled'],
        },
      ];

      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue(mockUnresolvedData),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await service.findUnresolvedPastDates();

      expect(result.hasUnresolved).toBe(true);
      expect(result.dates).toHaveLength(2);
      expect(result.dates[0]).toEqual({
        date: '2026-01-28',
        count: 3,
        statuses: ['scheduled', 'checked_in'],
      });
      expect(result.dates[1]).toEqual({
        date: '2026-01-30',
        count: 2,
        statuses: ['scheduled'],
      });
    });

    it('should order results by date ascending', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.findUnresolvedPastDates();

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'attendance.scheduled_date',
        'ASC',
      );
    });

    it('should limit results to 10 dates', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.findUnresolvedPastDates();

      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
    });

    it('should exclude completed, cancelled, and missed statuses', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([]),
      };

      jest.spyOn(repository, 'createQueryBuilder').mockReturnValue(
        mockQueryBuilder as any,
      );

      await service.findUnresolvedPastDates();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'attendance.status NOT IN (:...resolvedStatuses)',
        {
          resolvedStatuses: [
            AttendanceStatus.COMPLETED,
            AttendanceStatus.CANCELLED,
            AttendanceStatus.MISSED,
          ],
        },
      );
    });
  });

  describe('postpone', () => {
    const mockScheduleSetting = {
      id: 1,
      day_of_week: 2, // Tuesday
      max_concurrent_assessment: 5,
      max_concurrent_physiotherapy_tens: 10,
      is_active: true,
    };

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();
    });

    it('should successfully postpone a assessment attendance without updating sessions', async () => {
      const attendanceId = 1;
      const newDate = '2026-03-15';
      const assessmentAttendance = {
        ...mockAttendance,
        id: attendanceId,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(assessmentAttendance as Attendance);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest.spyOn(repository, 'save').mockImplementation(async (attendance: any) => {
        return {
          ...attendance,
          scheduled_date: newDate,
        };
      });

      const mockHolidayService = module.get(HolidayService);
      jest.spyOn(mockHolidayService, 'isHolidayForTreatment').mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(getRepositoryToken(ScheduleSetting));
      jest.spyOn(mockScheduleSettingRepo, 'findOne').mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      const getSessionsByAttendanceSpy = jest.spyOn(mockSessionService, 'getSessionsByAttendance');

      const result = await service.postpone(attendanceId, newDate);

      expect(result.scheduled_date).toBe(newDate);
      expect(result.notes).toContain('Reagendado: 2026-02-20 → 2026-03-15');
      // Should NOT call SessionService for assessment attendances
      expect(getSessionsByAttendanceSpy).not.toHaveBeenCalled();
    });

    it('should postpone a physiotherapy attendance and update linked sessions', async () => {
      const attendanceId = 2;
      const newDate = '2026-03-15';
      const physiotherapyAttendance = {
        ...mockAttendance,
        id: attendanceId,
        type: AttendanceType.PHYSIOTHERAPY,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      const mockLinkedSessions: SessionResponseDto[] = [
        mockSessionResponseDto({
          id: 10,
          attendance_id: attendanceId,
          scheduled_date: '2026-02-20',
          session_number: 1,
        }),
        mockSessionResponseDto({
          id: 11,
          attendance_id: attendanceId,
          scheduled_date: '2026-02-20',
          session_number: 2,
        }),
      ];

      jest.spyOn(service, 'findOne').mockResolvedValue(physiotherapyAttendance as Attendance);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest.spyOn(repository, 'save').mockImplementation(async (attendance: any) => {
        return { ...attendance };
      });

      const mockHolidayService = module.get(HolidayService);
      jest.spyOn(mockHolidayService, 'isHolidayForTreatment').mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(getRepositoryToken(ScheduleSetting));
      jest.spyOn(mockScheduleSettingRepo, 'findOne').mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      const getSessionsByAttendanceSpy = jest.spyOn(mockSessionService, 'getSessionsByAttendance')
        .mockResolvedValue(mockLinkedSessions);
      const rescheduleSessionSpy = jest.spyOn(mockSessionService, 'rescheduleSession')
        .mockResolvedValue(mockSessionResponseDto({ id: 1, scheduled_date: newDate }));

      const result = await service.postpone(attendanceId, newDate);

      expect(result.scheduled_date).toBe(newDate);
      expect(result.notes).toContain('Reagendado: 2026-02-20 → 2026-03-15');
      
      // Should call SessionService for physiotherapy attendances
      expect(getSessionsByAttendanceSpy).toHaveBeenCalledWith(attendanceId);
      
      // Should reschedule both sessions
      expect(rescheduleSessionSpy).toHaveBeenCalledTimes(2);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(10, newDate);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(11, newDate);
    });

    it('should postpone a tens attendance and update linked sessions', async () => {
      const attendanceId = 3;
      const newDate = '2026-03-15';
      const tensAttendance = {
        ...mockAttendance,
        id: attendanceId,
        type: AttendanceType.TENS,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      const mockLinkedSessions: SessionResponseDto[] = [
        mockSessionResponseDto({
          id: 20,
          attendance_id: attendanceId,
          scheduled_date: '2026-02-20',
          session_number: 1,
        }),
      ];

      jest.spyOn(service, 'findOne').mockResolvedValue(tensAttendance as Attendance);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest.spyOn(repository, 'save').mockImplementation(async (attendance: any) => {
        return { ...attendance };
      });

      const mockHolidayService = module.get(HolidayService);
      jest.spyOn(mockHolidayService, 'isHolidayForTreatment').mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(getRepositoryToken(ScheduleSetting));
      jest.spyOn(mockScheduleSettingRepo, 'findOne').mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      const getSessionsByAttendanceSpy = jest.spyOn(mockSessionService, 'getSessionsByAttendance')
        .mockResolvedValue(mockLinkedSessions);
      const rescheduleSessionSpy = jest.spyOn(mockSessionService, 'rescheduleSession')
        .mockResolvedValue(mockSessionResponseDto({ id: 1, scheduled_date: newDate }));

      const result = await service.postpone(attendanceId, newDate);

      expect(result.scheduled_date).toBe(newDate);
      
      // Should call SessionService for tens attendances
      expect(getSessionsByAttendanceSpy).toHaveBeenCalledWith(attendanceId);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(20, newDate);
    });

    it('should not update completed sessions when postponing', async () => {
      const attendanceId = 4;
      const newDate = '2026-03-15';
      const physiotherapyAttendance = {
        ...mockAttendance,
        id: attendanceId,
        type: AttendanceType.PHYSIOTHERAPY,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      const mockLinkedSessions: SessionResponseDto[] = [
        mockSessionResponseDto({
          id: 30,
          attendance_id: attendanceId,
          scheduled_date: '2026-02-20',
          status: SessionAttendanceStatus.COMPLETED,
          session_number: 1,
        }),
        mockSessionResponseDto({
          id: 31,
          attendance_id: attendanceId,
          scheduled_date: '2026-02-20',
          session_number: 2,
        }),
      ];

      jest.spyOn(service, 'findOne').mockResolvedValue(physiotherapyAttendance as Attendance);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest.spyOn(repository, 'save').mockImplementation(async (attendance: any) => {
        return { ...attendance };
      });

      const mockHolidayService = module.get(HolidayService);
      jest.spyOn(mockHolidayService, 'isHolidayForTreatment').mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(getRepositoryToken(ScheduleSetting));
      jest.spyOn(mockScheduleSettingRepo, 'findOne').mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      jest.spyOn(mockSessionService, 'getSessionsByAttendance')
        .mockResolvedValue(mockLinkedSessions);
      const rescheduleSessionSpy = jest.spyOn(mockSessionService, 'rescheduleSession')
        .mockResolvedValue(mockSessionResponseDto({ id: 1, scheduled_date: newDate }));

      await service.postpone(attendanceId, newDate);

      // Should only reschedule the scheduled session (id: 31), not the completed one (id: 30)
      expect(rescheduleSessionSpy).toHaveBeenCalledTimes(1);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(31, newDate);
      expect(rescheduleSessionSpy).not.toHaveBeenCalledWith(30, newDate);
    });

    it('should throw BadRequestException when postponing to a finalized day', async () => {
      const attendanceId = 1;
      const newDate = '2026-03-15';
      const assessmentAttendance = {
        ...mockAttendance,
        id: attendanceId,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      jest.spyOn(service, 'findOne').mockResolvedValue(assessmentAttendance as Attendance);

      const dayFinalizationService = module.get(DayFinalizationService);
      jest
        .spyOn(dayFinalizationService, 'getFinalizationStatus')
        .mockResolvedValue({ finalization_date: newDate } as DayFinalization);

      await expect(service.postpone(attendanceId, newDate)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.postpone(attendanceId, newDate)).rejects.toThrow(
        'Dia já finalizado. Não é mais possível agendar atendimentos para este dia.',
      );
    });
  });

  describe('reschedule', () => {
    const mockScheduleSettingForReschedule = {
      id: 1,
      day_of_week: 0, // 2026-03-15 is Sunday
      start_time: '09:00',
      end_time: '17:00',
      max_concurrent_assessment: 2,
      max_concurrent_physiotherapy_tens: 2,
      is_active: true,
      created_date: '2025-07-22',
      created_time: '09:00:00',
      updated_date: '2025-07-22',
      updated_time: '09:00:00',
    } as ScheduleSetting;

    it('should throw BadRequestException with existing rescheduled date when already rescheduled', async () => {
      const cancelledAttendance = {
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: PatientStatus.IN_TREATMENT,
        },
        type: AttendanceType.PHYSIOTHERAPY,
        status: AttendanceStatus.CANCELLED,
        scheduled_date: '2026-02-20',
        scheduled_time: '09:00:00',
        parent_attendance_id: null,
      };

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([cancelledAttendance as Attendance])
        .mockResolvedValueOnce([
          {
            rescheduled_from_attendance_id: 1,
            scheduled_date: '2026-03-22',
          } as Attendance,
        ]);

      await expect(
        service.reschedule({
          attendance_ids: [1],
          new_scheduled_date: '2026-04-01',
        }),
      ).rejects.toThrow(
        'Este atendimento já foi reagendado para o dia 22/03/2026',
      );
    });

    it('should throw BadRequestException when patient is not in treatment', async () => {
      const cancelledAttendance = {
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: PatientStatus.DISCHARGED,
        },
        type: AttendanceType.PHYSIOTHERAPY,
        status: AttendanceStatus.CANCELLED,
        scheduled_date: '2026-02-20',
        scheduled_time: '09:00:00',
        parent_attendance_id: null,
      };

      jest.spyOn(repository, 'find').mockResolvedValue([cancelledAttendance as Attendance]);

      await expect(
        service.reschedule({
          attendance_ids: [1],
          new_scheduled_date: '2026-03-15',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reschedule({
          attendance_ids: [1],
          new_scheduled_date: '2026-03-15',
        }),
      ).rejects.toThrow(
        'Paciente não está em tratamento. Apenas pacientes em tratamento podem reagendar atendimentos.',
      );
    });

    it('should succeed rescheduling missed assessment attendance when patient has completed root assessment (skipCompletedRootAssessmentCheck used, e.g. end-of-day)', async () => {
      const newDate = '2026-03-15'; // Sunday
      const missedAssessmentAttendance = {
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: PatientStatus.IN_TREATMENT,
        },
        type: AttendanceType.ASSESSMENT,
        status: AttendanceStatus.MISSED,
        scheduled_date: '2026-02-20',
        scheduled_time: '09:00:00',
        parent_attendance_id: null,
        rescheduled_from_attendance_id: null,
      } as Attendance;

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([missedAssessmentAttendance])
        .mockResolvedValueOnce([]); // alreadyRescheduled
      jest.spyOn(repository, 'count').mockResolvedValue(0); // concurrent slot count
      jest.spyOn(repository, 'create').mockImplementation((dto) => ({ ...dto, id: 2 } as Attendance));
      jest.spyOn(repository, 'save').mockImplementation(async (att) => ({ ...att, id: 2 } as Attendance));

      const dayFinalizationService = module.get(DayFinalizationService);
      jest.spyOn(dayFinalizationService, 'getFinalizationStatus').mockResolvedValue(null);

      const holidayService = module.get(HolidayService);
      jest.spyOn(holidayService, 'isHolidayForTreatment').mockResolvedValue(false);

      const scheduleSettingRepo = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );
      jest.spyOn(scheduleSettingRepo, 'findOne').mockResolvedValue(mockScheduleSettingForReschedule);

      const result = await service.reschedule({
        attendance_ids: [1],
        new_scheduled_date: newDate,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        patient_id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: newDate,
        status: AttendanceStatus.SCHEDULED,
      });
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('bulkPostpone', () => {
    it('should return structured result with successes and failures', async () => {
      const attendanceOne = {
        ...mockAttendance,
        id: 1,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2026-03-10',
      } as Attendance;
      const attendanceTwo = {
        ...mockAttendance,
        id: 2,
        type: AttendanceType.ASSESSMENT,
        scheduled_date: '2026-03-10',
      } as Attendance;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(attendanceOne)
        .mockResolvedValueOnce(attendanceTwo);
      jest
        .spyOn(service, 'postpone')
        .mockResolvedValueOnce({ ...attendanceOne, scheduled_date: '2026-03-17' } as Attendance)
        .mockRejectedValueOnce(new Error('slot unavailable'));

      const result = await service.bulkPostpone([1, 2], '2026-03-17', false);

      expect(result.success_count).toBe(1);
      expect(result.failure_count).toBe(1);
      expect(result.successes).toEqual([
        { attendance_id: 1, message: 'Successfully postponed', new_date: '2026-03-17' },
      ]);
      expect(result.failures).toEqual([
        { attendance_id: 2, error: 'slot unavailable' },
      ]);
      expect(result.auto_rescheduled_returns).toEqual([]);
      expect(result.failed_return_reschedules).toEqual([]);
    });

    it('should keep furthest date when same assessment return is collected twice', async () => {
      const treatmentOne = {
        ...mockAttendance,
        id: 1,
        type: AttendanceType.PHYSIOTHERAPY,
        scheduled_date: '2026-03-10',
      } as Attendance;
      const treatmentTwo = {
        ...mockAttendance,
        id: 2,
        type: AttendanceType.TENS,
        scheduled_date: '2026-03-10',
      } as Attendance;
      const assessmentReturn = {
        ...mockAttendance,
        id: 900,
        type: AttendanceType.ASSESSMENT,
        patient_id: 1,
        patient: { id: 1, name: 'Paciente Teste' } as unknown as Patient,
        scheduled_date: '2026-03-17',
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(treatmentOne)
        .mockResolvedValueOnce(treatmentTwo)
        .mockResolvedValueOnce(assessmentReturn);
      jest
        .spyOn(service, 'postpone')
        .mockResolvedValueOnce({ ...treatmentOne, scheduled_date: '2026-03-24' } as Attendance)
        .mockResolvedValueOnce({ ...treatmentTwo, scheduled_date: '2026-03-24' } as Attendance)
        .mockResolvedValueOnce({ ...assessmentReturn, scheduled_date: '2026-04-14' } as Attendance);

      jest
        .spyOn(service, 'getTreatmentIdForAttendanceId')
        .mockResolvedValueOnce(11)
        .mockResolvedValueOnce(22);

      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-03-10')
        .mockResolvedValueOnce('2026-03-10');

      const serviceWithReturnFinder = service as unknown as {
        findReturnAssessmentAttendancesForTreatment: (
          treatmentSessionId: number,
          minScheduledDate: string,
        ) => Promise<Attendance[]>;
      };
      jest
        .spyOn(serviceWithReturnFinder, 'findReturnAssessmentAttendancesForTreatment')
        .mockResolvedValue([assessmentReturn]);

      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          attendance_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 1,
          return_when_treatment_complete: true,
        })
        .mockResolvedValueOnce({
          attendance_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 3,
          return_when_treatment_complete: true,
        });

      jest
        .spyOn(service, 'findNextSchedulableDate')
        .mockResolvedValueOnce('2026-03-31')
        .mockResolvedValueOnce('2026-04-14');

      const result = await service.bulkPostpone([1, 2], '2026-03-24', true);

      expect(result.auto_rescheduled_returns).toEqual([
        {
          attendance_id: 900,
          patient_id: 1,
          patient_name: 'Paciente Teste',
          old_date: '2026-03-17',
          new_date: '2026-04-14',
        },
      ]);
      expect(result.failed_return_reschedules).toEqual([]);
      expect(service.postpone).toHaveBeenCalledWith(900, '2026-04-14');
    });

    it('should report failed return reschedules without rolling back main postpones', async () => {
      const treatmentAttendance = {
        ...mockAttendance,
        id: 1,
        type: AttendanceType.PHYSIOTHERAPY,
        scheduled_date: '2026-03-10',
      } as Attendance;
      const assessmentReturn = {
        ...mockAttendance,
        id: 901,
        type: AttendanceType.ASSESSMENT,
        patient_id: 1,
        patient: { id: 1, name: 'Paciente Teste' } as unknown as Patient,
        scheduled_date: '2026-03-17',
        status: AttendanceStatus.SCHEDULED,
      } as Attendance;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(treatmentAttendance)
        .mockResolvedValueOnce(assessmentReturn);
      jest
        .spyOn(service, 'postpone')
        .mockResolvedValueOnce({ ...treatmentAttendance, scheduled_date: '2026-03-24' } as Attendance)
        .mockRejectedValueOnce(new Error('holiday blocked'));
      jest
        .spyOn(service, 'getTreatmentIdForAttendanceId')
        .mockResolvedValueOnce(33);

      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-03-10');

      const serviceWithReturnFinder = service as unknown as {
        findReturnAssessmentAttendancesForTreatment: (
          treatmentSessionId: number,
          minScheduledDate: string,
        ) => Promise<Attendance[]>;
      };
      jest
        .spyOn(serviceWithReturnFinder, 'findReturnAssessmentAttendancesForTreatment')
        .mockResolvedValue([assessmentReturn]);

      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          attendance_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 1,
          return_when_treatment_complete: true,
        });

      jest
        .spyOn(service, 'findNextSchedulableDate')
        .mockResolvedValueOnce('2026-03-31');

      const result = await service.bulkPostpone([1], '2026-03-24', true);

      expect(result.success_count).toBe(1);
      expect(result.failure_count).toBe(0);
      expect(result.auto_rescheduled_returns).toEqual([]);
      expect(result.failed_return_reschedules).toEqual([
        { attendance_id: 901, error: 'holiday blocked' },
      ]);
    });
  });

  describe('recomputeReturnForEpisode', () => {
    const treatmentAttendance = {
      ...mockAttendance,
      id: 5,
      type: AttendanceType.PHYSIOTHERAPY,
      scheduled_date: '2026-06-03',
    } as Attendance;

    const returnAttendance = {
      ...mockAttendance,
      id: 900,
      type: AttendanceType.ASSESSMENT,
      patient_id: 1,
      patient: { id: 1, name: 'Paciente Teste' } as unknown as Patient,
      scheduled_date: '2026-06-24',
      status: AttendanceStatus.SCHEDULED,
    } as Attendance;

    it('should return rescheduled=false when no treatment is linked', async () => {
      jest.spyOn(service, 'getTreatmentIdForAttendanceId').mockResolvedValueOnce(null);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should return rescheduled=false when return_when_treatment_complete=false and return_weeks=0', async () => {
      jest.spyOn(service, 'getTreatmentIdForAttendanceId').mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest.spyOn(treatmentService, 'getSessionWithReturnConfig').mockResolvedValueOnce({
        attendance_id: 100,
        patient_id: 1,
        consultation_id: 50,
        return_weeks: 0,
        return_when_treatment_complete: false,
      });

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should return rescheduled=false when no scheduled sessions exist for consultation treatments', async () => {
      jest.spyOn(service, 'getTreatmentIdForAttendanceId').mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest.spyOn(treatmentService, 'getSessionWithReturnConfig').mockResolvedValueOnce({
        attendance_id: 100,
        patient_id: 1,
        consultation_id: 50,
        return_weeks: 1,
        return_when_treatment_complete: true,
      });
      jest.spyOn(treatmentService, 'getTreatmentIdsByConsultationId').mockResolvedValueOnce([10, 11]);
      const recordService = module.get(SessionService);
      jest.spyOn(recordService, 'getMaxScheduledDateForTreatment').mockResolvedValue(null);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should return rescheduled=false when return is already at the computed date', async () => {
      jest.spyOn(service, 'getTreatmentIdForAttendanceId').mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest.spyOn(treatmentService, 'getSessionWithReturnConfig').mockResolvedValueOnce({
        attendance_id: 100,
        patient_id: 1,
        consultation_id: 50,
        return_weeks: 1,
        return_when_treatment_complete: true,
      });
      jest.spyOn(treatmentService, 'getTreatmentIdsByConsultationId').mockResolvedValueOnce([10]);
      const recordService = module.get(SessionService);
      jest.spyOn(recordService, 'getMaxScheduledDateForTreatment').mockResolvedValueOnce('2026-06-24');
      jest.spyOn(service, 'findNextSchedulableDate').mockResolvedValueOnce('2026-07-01');

      const serviceWithFinder = service as unknown as {
        findReturnAssessmentAttendancesForTreatment: (tid: number, minDate: string) => Promise<Attendance[]>;
      };
      jest.spyOn(serviceWithFinder, 'findReturnAssessmentAttendancesForTreatment')
        .mockResolvedValueOnce([{ ...returnAttendance, scheduled_date: '2026-07-01' } as Attendance]);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should recompute return date using max session across all consultation treatments', async () => {
      // Two treatments: T1 last session Jun 24, T2 last session Jun 17. Max = Jun 24. return_weeks=1 → Jul 1.
      jest.spyOn(service, 'getTreatmentIdForAttendanceId').mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest.spyOn(treatmentService, 'getSessionWithReturnConfig').mockResolvedValueOnce({
        attendance_id: 100,
        patient_id: 1,
        consultation_id: 50,
        return_weeks: 1,
        return_when_treatment_complete: true,
      });
      jest.spyOn(treatmentService, 'getTreatmentIdsByConsultationId').mockResolvedValueOnce([10, 11]);
      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-06-24') // T1
        .mockResolvedValueOnce('2026-06-17'); // T2
      jest.spyOn(service, 'findNextSchedulableDate').mockResolvedValueOnce('2026-07-01');

      const serviceWithFinder = service as unknown as {
        findReturnAssessmentAttendancesForTreatment: (tid: number, minDate: string) => Promise<Attendance[]>;
      };
      jest.spyOn(serviceWithFinder, 'findReturnAssessmentAttendancesForTreatment')
        .mockResolvedValueOnce([returnAttendance]);

      jest.spyOn(service, 'findOne').mockResolvedValueOnce(returnAttendance);
      jest.spyOn(service, 'postpone').mockResolvedValueOnce({
        ...returnAttendance,
        scheduled_date: '2026-07-01',
      } as Attendance);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({
        rescheduled: true,
        attendance_id: 900,
        patient_id: 1,
        patient_name: 'Paciente Teste',
        old_date: '2026-06-24',
        new_date: '2026-07-01',
      });
      expect(recordService.getMaxScheduledDateForTreatment).toHaveBeenCalledWith(10);
      expect(recordService.getMaxScheduledDateForTreatment).toHaveBeenCalledWith(11);
      expect(service.findNextSchedulableDate).toHaveBeenCalledWith('2026-07-01', AttendanceType.ASSESSMENT);
    });
  });
});
