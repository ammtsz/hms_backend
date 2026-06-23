import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentService } from '../appointment.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Appointment } from '../../entities/appointment.entity';
import { Patient } from '../../entities/patient.entity';
import { CreateAppointmentDto } from '../../dtos/appointment.dto';
import {
  AppointmentType,
  AppointmentStatus,
  PatientStatus,
} from '../../common/enums';
import { ScheduleSetting } from '../../entities/schedule-setting.entity';
import { Repository, DeleteResult } from 'typeorm';
import {
  ResourceNotFoundException,
  InvalidAppointmentStatusTransitionException,
  AppointmentTimeSlotUnavailableException,
} from '../../common/exceptions';
import { BadRequestException } from '@nestjs/common';
import { SessionService } from '../session.service';
import { TreatmentService } from '../treatment.service';
import { HolidayService } from '../holiday.service';
import { DayFinalizationService } from '../day-finalization.service';
import { DayFinalization } from '../../entities/day-finalization.entity';
import { SessionResponseDto } from '../../dtos/session.dto';
import { SessionAppointmentStatus } from '../../entities/session.entity';

function mockSessionResponseDto(
  overrides: Partial<SessionResponseDto> & Pick<SessionResponseDto, 'id'>,
): SessionResponseDto {
  return {
    treatment_id: 1,
    session_number: 1,
    scheduled_date: '2026-02-20',
    status: SessionAppointmentStatus.SCHEDULED,
    created_date: '2026-01-01',
    created_time: '00:00:00',
    updated_date: '2026-01-01',
    updated_time: '00:00:00',
    ...overrides,
  };
}

describe('AppointmentService', () => {
  let service: AppointmentService;
  let repository: Repository<Appointment>;
  let module: TestingModule;

  const mockAppointment = {
    id: 1,
    patient_id: 1,
    patient: null,
    type: AppointmentType.ASSESSMENT,
    status: AppointmentStatus.SCHEDULED,
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
  } as Appointment;

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
    save: jest.fn().mockResolvedValue(mockAppointment), // Fix save to return the appointment
    find: jest.fn().mockResolvedValue([mockAppointment]),
    findOne: jest.fn().mockResolvedValue(mockAppointment),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    merge: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockReturnValue(mockAppointment),
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    findByIds: jest.fn().mockResolvedValue([mockAppointment]), // Add findByIds mock for bulkUpdateStatus
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        AppointmentService,
        {
          provide: getRepositoryToken(Appointment),
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
            findOne: jest.fn().mockResolvedValue({ max_daily_appointments: 10 }),
          },
        },
        {
          provide: SessionService,
          useValue: {
            rescheduleSession: jest.fn(),
            markSessionMissed: jest.fn(),
            getSessionsByAppointment: jest.fn().mockResolvedValue([]),
            getSessionsForReschedule: jest.fn().mockResolvedValue([]),
            cancelSessionsByAppointmentId: jest
              .fn()
              .mockResolvedValue(undefined),
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

    service = module.get<AppointmentService>(AppointmentService);
    repository = module.get<Repository<Appointment>>(
      getRepositoryToken(Appointment),
    );
  });

  afterEach(() => {
    // Reset findOne default so tests that mock it (create, validateScheduling) don't leak
    const findOneMock = repository.findOne as jest.Mock;
    if (findOneMock.mockResolvedValue) {
      findOneMock.mockResolvedValue(mockAppointment);
    }
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new appointment', async () => {
      const createDto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
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
    it('should return an array of appointments', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockAppointment]);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('findEligibleParentOptions', () => {
    it('should return eligible root assessment appointments with options', async () => {
      const rootAppointment = {
        ...mockAppointment,
        id: 10,
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        parent_appointment_id: null,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        consultation: {
          patient_status: 'T',
          main_concern: 'Back pain',
        },
      } as unknown as Appointment;

      jest.spyOn(repository, 'find').mockResolvedValueOnce([rootAppointment]);

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
        main_concern: 'Back pain',
      });
      expect(result.options[0].label).toBe('2025-07-22 - Back pain');
    });

    it('should exclude roots whose chain has patient_status D or C', async () => {
      const rootWithAlta = {
        ...mockAppointment,
        id: 1,
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        parent_appointment_id: null,
        scheduled_date: '2025-07-20',
        consultation: {
          patient_status: 'D',
          main_concern: 'Discharged',
        },
      } as unknown as Appointment;
      const rootOngoing = {
        ...mockAppointment,
        id: 2,
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        parent_appointment_id: null,
        scheduled_date: '2025-07-22',
        consultation: {
          patient_status: 'T',
          main_concern: 'Back pain',
        },
      } as unknown as Appointment;

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([rootWithAlta, rootOngoing]);

      const result = await service.findEligibleParentOptions(1);

      expect(result.options).toHaveLength(1);
      expect(result.options[0].id).toBe(2);
      expect(result.options[0].main_concern).toBe('Back pain');
    });

    it('should return empty options when patient has no assessment roots', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce([]);

      const result = await service.findEligibleParentOptions(1);

      expect(result.options).toEqual([]);
    });
  });

  describe('findOne', () => {
    it('should return a single appointment', async () => {
      const result = await service.findOne(1);

      expect(result).toEqual(mockAppointment);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['patient'],
      });
    });
  });

  describe('syncStatusFromSession', () => {
    it('should update appointment status without running side effects', async () => {
      const savedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.COMPLETED,
        completed_time: '10:30:00',
      };
      mockRepository.save.mockResolvedValueOnce(savedAppointment);

      const result = await service.syncStatusFromSession(
        1,
        AppointmentStatus.COMPLETED,
      );

      expect(result.status).toBe(AppointmentStatus.COMPLETED);
      expect(repository.merge).toHaveBeenCalledWith(
        mockAppointment,
        expect.objectContaining({
          status: AppointmentStatus.COMPLETED,
          updated_date: expect.any(String),
          updated_time: expect.any(String),
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should set cancelled_date and absence_notes when status is CANCELLED', async () => {
      const savedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
        cancelled_date: '2025-07-22',
        cancelled_time: '10:00:00',
        absence_notes: 'Reason',
      };
      mockRepository.save.mockResolvedValueOnce(savedAppointment);

      await service.syncStatusFromSession(1, AppointmentStatus.CANCELLED, {
        cancellationReason: 'Reason',
      });

      expect(repository.merge).toHaveBeenCalledWith(
        mockAppointment,
        expect.objectContaining({
          status: AppointmentStatus.CANCELLED,
          cancelled_date: expect.any(String),
          cancelled_time: expect.any(String),
          absence_notes: 'Reason',
        }),
      );
    });
  });

  describe('update', () => {
    it('should update an appointment', async () => {
      const updateDto = { notes: 'Updated notes' };

      await service.update(1, updateDto);

      // Update method adds updated_date and updated_time automatically
      expect(repository.merge).toHaveBeenCalledWith(
        mockAppointment,
        expect.objectContaining({
          notes: 'Updated notes',
          updated_date: expect.any(String),
          updated_time: expect.any(String),
        }),
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
        main_concern: null,
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
      const saveSpy = jest
        .spyOn(patientRepo, 'save')
        .mockResolvedValue(patient);

      const att1: Appointment = {
        ...mockAppointment,
        id: 1,
        patient_id: 1,
        scheduled_date: '2025-07-22',
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;
      const att2: Appointment = {
        ...mockAppointment,
        id: 2,
        patient_id: 1,
        scheduled_date: '2025-07-22',
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(att1)
        .mockResolvedValueOnce(att2);

      jest
        .spyOn(repository, 'save')
        .mockResolvedValueOnce({
          ...att1,
          status: AppointmentStatus.MISSED,
          absence_justified: false,
        } as Appointment)
        .mockResolvedValueOnce({
          ...att2,
          status: AppointmentStatus.MISSED,
          absence_justified: false,
        } as Appointment);

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
        status: AppointmentStatus.MISSED,
        absence_justified: false,
      });
      await service.update(2, {
        status: AppointmentStatus.MISSED,
        absence_justified: false,
      });

      expect(patient.missing_appointments_streak).toBe(1);
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancel', () => {
    it('should cancel an appointment by changing status to CANCELLED', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockAppointment);
      jest.spyOn(repository, 'save').mockResolvedValueOnce({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      } as Appointment);

      await service.cancel(1, 'Test cancellation');

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.CANCELLED,
          absence_notes: 'Test cancellation',
          absence_justified: true,
        }),
      );
    });

    it('should throw ResourceNotFoundException when appointment not found', async () => {
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
      // override to IN_TREATMENT in tests that assert parent-appointment rules for "in treatment".
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

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        'No schedule is available for this date. Choose another day.',
      );
    });

    it('should throw AppointmentTimeSlotUnavailableException when time is outside operational hours', async () => {
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

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        AppointmentTimeSlotUnavailableException,
      );
    });

    it('should throw AppointmentTimeSlotUnavailableException when maximum concurrent appointments reached', async () => {
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

      jest.spyOn(repository, 'count').mockImplementation((options: unknown) => {
        const where = (
          options as {
            where?: { type?: AppointmentType; status?: AppointmentStatus };
          }
        ).where;

        // Concurrent slot count for assessment appointments
        if (
          where?.type === AppointmentType.ASSESSMENT &&
          where.status === AppointmentStatus.SCHEDULED
        ) {
          return Promise.resolve(2);
        }

        // Default to 0 for other count calls (e.g., completed root or duplicate checks)
        return Promise.resolve(0);
      });

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        AppointmentTimeSlotUnavailableException,
      );
    });

    it('should throw BadRequestException when scheduling on a finalized day', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const dayFinalizationService = module.get(DayFinalizationService);
      jest
        .spyOn(dayFinalizationService, 'getFinalizationStatus')
        .mockResolvedValue({
          finalization_date: '2025-07-22',
        } as DayFinalization);

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        'Day already finalized. It is no longer possible to schedule appointments for this day.',
      );
    });

    it('should throw BadRequestException when no parent_appointment_id but patient has completed root assessment appointment', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        // parent_appointment_id omitted - frontend sent "first appointment"
      };

      jest.spyOn(repository, 'count').mockResolvedValue(1); // patient has 1 completed root

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toMatch(
        /Select the main complaint \(previous consultation\) related to this appointment/,
      );
    });

    it('should throw BadRequestException when IN_TREATMENT patient schedules assessment without parent (even if no completed root row)', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
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
      expect(thrown?.message).toMatch(
        /Select the main complaint \(previous consultation\) related to this appointment/,
      );
    });

    it('should reject parent_appointment_id when patient is DISCHARGED (D)', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.DISCHARGED,
      } as Patient);

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_appointment_id: 10,
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Main complaint is outdated/,
      );
    });

    it('should reject parent_appointment_id when patient is CONSECUTIVE_NO_SHOWS (C)', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      } as Patient);

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_appointment_id: 10,
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Main complaint is outdated/,
      );
    });

    it('should reject parent_appointment_id when patient is NEW_PATIENT (N)', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.NEW_PATIENT,
      } as Patient);

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_appointment_id: 10,
      };

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
      await expect(service.create(dto)).rejects.toThrow(
        /Main complaint is outdated/,
      );
    });

    it('should allow assessment with parent_appointment_id when patient is IN_TREATMENT and parent is eligible root', async () => {
      jest.spyOn(patientRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_status: PatientStatus.IN_TREATMENT,
      } as Patient);

      const rootParent = {
        id: 10,
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        parent_appointment_id: null,
        scheduled_date: '2025-07-01',
        scheduled_time: '09:00:00',
        status: AppointmentStatus.COMPLETED,
        consultation: null,
      } as Appointment;

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

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
        parent_appointment_id: 10,
      };

      await expect(service.create(dto)).resolves.toBeDefined();
    });

    it('should allow assessment appointment without parent_appointment_id for DISCHARGED or CONSECUTIVE_NO_SHOWS patient', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
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
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      } as Patient);
      await expect(service.create(dto)).resolves.toBeDefined();
    });

    it('should throw BadRequestException when DISCHARGED patient has open root assessment and tries another without parent', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
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
        ...mockAppointment,
        scheduled_date: '2025-07-15',
        patient: { id: 1, name: 'Emily Williams' } as Patient,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(openRootWithPatient as Appointment);

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toContain(
        'Complete this consultation before scheduling a new one.',
      );
    });

    it('should throw BadRequestException when no parent_appointment_id and patient has open root assessment appointment', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
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
        ...mockAppointment,
        scheduled_date: '2025-07-15',
        patient: { id: 1, name: 'Emily Williams' } as Patient,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(openRootWithPatient as Appointment);

      let thrown: Error | null = null;
      try {
        await service.create(dto);
      } catch (e) {
        thrown = e as Error;
      }
      expect(thrown).toBeInstanceOf(BadRequestException);
      expect(thrown?.message).toContain(
        'Complete this consultation before scheduling a new one.',
      );
      expect(thrown?.message).toContain('Emily Williams');
      expect(thrown?.message).toContain('07/15/2025'); // formatDisplayDate('2025-07-15')
    });

    it('should throw BadRequestException when patient already has appointment for same date and type', async () => {
      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const dayFinalizationService = module.get(DayFinalizationService);
      jest
        .spyOn(dayFinalizationService, 'getFinalizationStatus')
        .mockResolvedValue(null);
      const holidayService = module.get(HolidayService);
      jest
        .spyOn(holidayService, 'isHolidayForTreatment')
        .mockResolvedValue(false);
      jest.spyOn(repository, 'count').mockImplementation((options: any) => {
        if (
          options?.where?.scheduled_date === '2025-07-22' &&
          options?.where?.patient_id === 1
        )
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
        'This patient already has a consultation scheduled for this date.',
      );
    });

    it('should allow assessment appointment without parent_appointment_id for NEW_PATIENT when patient has no completed root', async () => {
      const createDto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
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
      jest
        .spyOn(scheduleSettingRepository, 'findOne')
        .mockImplementation((opts: any) => {
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
      ).rejects.toThrow(/do not have treatment slots/);
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

    it('returns false for physiotherapy when another open appointment has same body location and color', async () => {
      const sessionService = module.get<SessionService>(SessionService);
      jest.spyOn(repository, 'find').mockImplementation((args) => {
        const w = args as { where?: { patient_id?: number } };
        if (w?.where?.patient_id != null) {
          return Promise.resolve([{ id: 10 } as Appointment]);
        }
        return Promise.resolve([]);
      });
      jest
        .spyOn(sessionService, 'getSessionsByAppointment')
        .mockImplementation((appointmentId: number) => {
          if (appointmentId === 99) {
            return Promise.resolve([
              {
                body_location: 'Neck',
                color: 'Blue',
              },
            ]);
          }
          if (appointmentId === 10) {
            return Promise.resolve([
              {
                body_location: 'Neck',
                color: 'Blue',
              },
            ]);
          }
          return Promise.resolve([]);
        });

      const result = await service.isDateAvailableForScheduling(
        testDate,
        AppointmentType.PHYSIOTHERAPY,
        { patientId: 1, originalAppointmentId: 99, scheduledTime: '09:00:00' },
      );

      expect(result).toBe(false);
    });

    it('returns true for physiotherapy when other appointment has same location but different color', async () => {
      const sessionService = module.get<SessionService>(SessionService);
      jest.spyOn(repository, 'find').mockImplementation((args) => {
        const w = args as { where?: { patient_id?: number } };
        if (w?.where?.patient_id != null) {
          return Promise.resolve([{ id: 10 } as Appointment]);
        }
        return Promise.resolve([]);
      });
      jest
        .spyOn(sessionService, 'getSessionsByAppointment')
        .mockImplementation((appointmentId: number) => {
          if (appointmentId === 99) {
            return Promise.resolve([{ body_location: 'Neck', color: 'Blue' }]);
          }
          if (appointmentId === 10) {
            return Promise.resolve([{ body_location: 'Neck', color: 'Red' }]);
          }
          return Promise.resolve([]);
        });

      const result = await service.isDateAvailableForScheduling(
        testDate,
        AppointmentType.PHYSIOTHERAPY,
        { patientId: 1, originalAppointmentId: 99, scheduledTime: '09:00:00' },
      );

      expect(result).toBe(true);
    });
  });

  describe('validateStatusTransition', () => {
    it('should throw InvalidAppointmentStatusTransitionException for invalid status transition', async () => {
      const updateDto = {
        status: AppointmentStatus.COMPLETED,
        notes: 'Updated notes',
      };

      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAppointmentStatusTransitionException,
      );
    });

    it('should allow valid status transition', async () => {
      const updateDto = {
        status: AppointmentStatus.CHECKED_IN,
        notes: 'Updated notes',
      };

      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow MISSED to MISSED status transition for updating absence notes', async () => {
      const updateDto = {
        status: AppointmentStatus.MISSED,
        absence_notes: 'Updated absence reason',
        absence_justified: false,
      };

      const mockMissedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.MISSED,
        absence_notes: 'Original absence reason',
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockMissedAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('cancel (soft delete)', () => {
    it('should cancel an appointment by setting status to CANCELLED', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockAppointment);
      jest.spyOn(repository, 'save').mockResolvedValueOnce({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      } as Appointment);

      await service.cancel(1);

      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: AppointmentStatus.CANCELLED,
        }),
      );
    });

    it('should throw ResourceNotFoundException when appointment not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      await expect(service.cancel(999)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });

    it('should throw InvalidAppointmentStatusTransitionException when trying to cancel completed appointment', async () => {
      const completedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.COMPLETED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(completedAppointment);

      await expect(service.cancel(1)).rejects.toThrow(
        InvalidAppointmentStatusTransitionException,
      );
    });

    it('should throw InvalidAppointmentStatusTransitionException when trying to cancel missed appointment', async () => {
      const missedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.MISSED,
      } as Appointment;

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(missedAppointment);

      await expect(service.cancel(1, 'Consecutive no-shows')).rejects.toThrow(
        InvalidAppointmentStatusTransitionException,
      );
    });
  });

  describe('findOpenAppointmentsByPatientId and cancelOpenAppointmentsForPatient', () => {
    it('findOpenAppointmentsByPatientId should only return scheduled, checked_in, in_progress', async () => {
      const scheduled = {
        ...mockAppointment,
        id: 1,
        status: AppointmentStatus.SCHEDULED,
      };
      const checkedIn = {
        ...mockAppointment,
        id: 2,
        status: AppointmentStatus.CHECKED_IN,
      };
      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([scheduled, checkedIn] as Appointment[]);

      const result = await service.findOpenAppointmentsByPatientId(1);

      expect(repository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            patient_id: 1,
            status: expect.anything(),
          }),
        }),
      );
      expect(result).toHaveLength(2);
      expect(result.map((a) => a.status)).toEqual([
        AppointmentStatus.SCHEDULED,
        AppointmentStatus.CHECKED_IN,
      ]);
    });

    it('cancelOpenAppointmentsForPatient should only cancel scheduled, checked_in, in_progress (never missed)', async () => {
      const scheduledAtt = {
        ...mockAppointment,
        id: 10,
        status: AppointmentStatus.SCHEDULED,
        scheduled_date: '2025-02-01',
        type: 'assessment',
      };
      const missedAtt = {
        ...mockAppointment,
        id: 20,
        status: AppointmentStatus.MISSED,
        scheduled_date: '2025-01-15',
        type: 'assessment',
      };
      // Simulate find returning both (e.g. if query were wrong): defensive filter must exclude MISSED
      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([scheduledAtt, missedAtt] as Appointment[]);
      const cancelSpy = jest
        .spyOn(service, 'cancel')
        .mockResolvedValueOnce(undefined);

      const result = await service.cancelOpenAppointmentsForPatient(
        1,
        'Consecutive no-shows',
      );

      // Only the SCHEDULED appointment should be cancelled (defensive filter excludes MISSED)
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith(10, 'Consecutive no-shows');
      expect(result).toEqual([
        { id: 10, type: 'assessment', scheduled_date: '2025-02-01' },
      ]);
    });

    it('cancelOpenAppointmentsForPatient should exclude given appointment IDs (e.g. just-completed)', async () => {
      const completedAtt = {
        ...mockAppointment,
        id: 10,
        status: AppointmentStatus.IN_PROGRESS,
        scheduled_date: '2025-02-01',
        type: 'assessment',
      };
      const scheduledAtt = {
        ...mockAppointment,
        id: 20,
        status: AppointmentStatus.SCHEDULED,
        scheduled_date: '2025-02-15',
        type: 'assessment',
      };
      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([completedAtt, scheduledAtt] as Appointment[]);
      const cancelSpy = jest
        .spyOn(service, 'cancel')
        .mockResolvedValueOnce(undefined);

      const result = await service.cancelOpenAppointmentsForPatient(
        1,
        'Discharged',
        {
          excludeAppointmentIds: [10],
        },
      );

      // Only appointment 20 should be cancelled; 10 is excluded
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith(20, 'Discharged');
      expect(result).toEqual([
        { id: 20, type: 'assessment', scheduled_date: '2025-02-15' },
      ]);
    });

    it('cancelOpenAppointmentsByIds should only cancel open statuses (never missed or completed)', async () => {
      const scheduledAtt = {
        ...mockAppointment,
        id: 10,
        status: AppointmentStatus.SCHEDULED,
        scheduled_date: '2025-02-01',
        type: 'assessment',
      };
      const missedAtt = {
        ...mockAppointment,
        id: 20,
        status: AppointmentStatus.MISSED,
        scheduled_date: '2025-01-15',
        type: 'assessment',
      };
      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([scheduledAtt, missedAtt] as Appointment[]);
      const cancelSpy = jest
        .spyOn(service, 'cancel')
        .mockResolvedValueOnce(undefined);

      const result = await service.cancelOpenAppointmentsByIds(
        [10, 20],
        'Session cancelled',
      );

      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(cancelSpy).toHaveBeenCalledWith(10, 'Session cancelled');
      expect(result).toEqual([
        { id: 10, type: 'assessment', scheduled_date: '2025-02-01' },
      ]);
    });
  });

  describe('update', () => {
    it('should update appointment without status change', async () => {
      const updateDto = {
        notes: 'Updated notes only',
      };

      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockAppointment);

      await service.update(1, updateDto);

      expect(repository.merge).toHaveBeenCalledWith(
        mockAppointment,
        expect.objectContaining({
          notes: 'Updated notes only',
          updated_date: expect.any(String),
          updated_time: expect.any(String),
        }),
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

      jest.spyOn(repository, 'count').mockImplementation((options: unknown) => {
        const where = (
          options as {
            where?: { type?: AppointmentType; status?: AppointmentStatus };
          }
        ).where;

        // Concurrent slot count for physiotherapy appointments
        if (
          where?.type === AppointmentType.PHYSIOTHERAPY &&
          where.status === AppointmentStatus.SCHEDULED
        ) {
          return Promise.resolve(1);
        }

        // Default to 0 for other count calls (e.g., completed root or duplicate checks)
        return Promise.resolve(0);
      });

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.PHYSIOTHERAPY,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      await expect(service.create(dto)).rejects.toThrow(
        AppointmentTimeSlotUnavailableException,
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

      jest.spyOn(repository, 'count').mockImplementation((options: unknown) => {
        const where = (
          options as {
            where?: { type?: AppointmentType; status?: AppointmentStatus };
          }
        ).where;

        // Concurrent slot count below limit for assessment appointments
        if (
          where?.type === AppointmentType.ASSESSMENT &&
          where.status === AppointmentStatus.SCHEDULED
        ) {
          return Promise.resolve(1);
        }

        // Default to 0 for other count calls (e.g., completed root or duplicate checks)
        return Promise.resolve(0);
      });

      const dto: CreateAppointmentDto = {
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2025-07-22',
        scheduled_time: '14:30',
        notes: 'Test notes',
      };

      const result = await service.create(dto);
      expect(result).toBeDefined();
    });
  });

  describe('findOne error cases', () => {
    it('should throw ResourceNotFoundException when appointment not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(
        ResourceNotFoundException,
      );
    });
  });

  describe('additional status transition tests', () => {
    it('should allow transition from CHECKED_IN to IN_PROGRESS', async () => {
      const updateDto = {
        status: AppointmentStatus.IN_PROGRESS,
        notes: 'Starting treatment',
      };

      const mockCheckedInAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CHECKED_IN,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCheckedInAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from IN_PROGRESS to COMPLETED', async () => {
      const updateDto = {
        status: AppointmentStatus.COMPLETED,
        notes: 'Treatment completed successfully',
      };

      const mockInProgressAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.IN_PROGRESS,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockInProgressAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from SCHEDULED to CANCELLED', async () => {
      const updateDto = {
        status: AppointmentStatus.CANCELLED,
        notes: 'Patient cancelled appointment',
      };

      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from SCHEDULED to MISSED', async () => {
      const updateDto = {
        status: AppointmentStatus.MISSED,
        notes: 'Patient missed appointment',
      };

      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should reject invalid transition from COMPLETED to SCHEDULED', async () => {
      const updateDto = {
        status: AppointmentStatus.SCHEDULED,
        notes: 'Trying to reschedule completed',
      };

      const mockCompletedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.COMPLETED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCompletedAppointment);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAppointmentStatusTransitionException,
      );
    });

    it('should reject invalid transition from CANCELLED to COMPLETED', async () => {
      const updateDto = {
        status: AppointmentStatus.COMPLETED,
        notes: 'Trying to complete cancelled',
      };

      const mockCancelledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCancelledAppointment);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAppointmentStatusTransitionException,
      );
    });

    // Test new bidirectional transitions
    it('should allow transition from CHECKED_IN to COMPLETED (direct completion)', async () => {
      const updateDto = {
        status: AppointmentStatus.COMPLETED,
        notes: 'Direct completion',
      };

      const mockCheckedInAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CHECKED_IN,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCheckedInAppointment);
      jest
        .spyOn(repository, 'merge')
        .mockReturnValueOnce(mockCheckedInAppointment);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValueOnce(mockCheckedInAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should allow transition from CHECKED_IN to SCHEDULED (moving back)', async () => {
      const updateDto = {
        status: AppointmentStatus.SCHEDULED,
        notes: 'Moving back to scheduled',
      };

      const mockCheckedInAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CHECKED_IN,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCheckedInAppointment);
      jest
        .spyOn(repository, 'merge')
        .mockReturnValueOnce(mockCheckedInAppointment);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValueOnce(mockCheckedInAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should NOT allow transition from COMPLETED to CHECKED_IN (completed is final)', async () => {
      const updateDto = {
        status: AppointmentStatus.CHECKED_IN,
        notes: 'Trying to reopen appointment',
      };

      const mockCompletedAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.COMPLETED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCompletedAppointment);

      await expect(service.update(1, updateDto)).rejects.toThrow(
        InvalidAppointmentStatusTransitionException,
      );
    });

    it('should allow transition from CANCELLED to SCHEDULED (rescheduling)', async () => {
      const updateDto = {
        status: AppointmentStatus.SCHEDULED,
        notes: 'Rescheduling cancelled appointment',
      };

      const mockCancelledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      } as Appointment;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockCancelledAppointment);
      jest
        .spyOn(repository, 'merge')
        .mockReturnValueOnce(mockCancelledAppointment);
      jest
        .spyOn(repository, 'save')
        .mockResolvedValueOnce(mockCancelledAppointment);

      await service.update(1, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('findAllForSchedule', () => {
    it('should return raw schedule data without filters', async () => {
      const result = await service.findAllForSchedule();

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
        statuses: [AppointmentStatus.SCHEDULED],
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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValueOnce(mockQueryBuilderForFilters as any);

      const result = await service.findAllForSchedule(filters);

      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'appointment.status IN (:...statuses)',
        { statuses: [AppointmentStatus.SCHEDULED] },
      );
      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'appointment.type = :type',
        { type: 'assessment' },
      );
      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'appointment.scheduled_date >= :fromDate',
        { fromDate: '2025-07-01' },
      );
      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'appointment.scheduled_date <= :toDate',
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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValueOnce(mockQueryBuilderForFilters as any);

      await service.findAllForSchedule({
        statuses: [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED],
      });

      expect(mockQueryBuilderForFilters.andWhere).toHaveBeenCalledWith(
        'appointment.status IN (:...statuses)',
        {
          statuses: [AppointmentStatus.SCHEDULED, AppointmentStatus.COMPLETED],
        },
      );
    });

    it('should handle empty filters', async () => {
      const filters = {};
      const result = await service.findAllForSchedule(filters);

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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValueOnce(mockQueryBuilderForString as any);

      const result = await service.findNextScheduledDate();

      expect(result).toBe('2025-07-23');
      expect(repository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should return null when no future appointments found', async () => {
      // Create a new mock that returns null
      const mockQueryBuilderForNull = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValueOnce(mockQueryBuilderForNull as any);

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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValueOnce(mockQueryBuilderForString as any);

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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValueOnce(mockQueryBuilderForError as any);

      await expect(service.findNextScheduledDate()).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getAppointmentStats', () => {
    const mockAppointments = [
      {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
        type: 'assessment',
      },
      {
        ...mockAppointment,
        id: 2,
        status: AppointmentStatus.CHECKED_IN,
        type: 'assessment',
      },
      {
        ...mockAppointment,
        id: 3,
        status: AppointmentStatus.COMPLETED,
        type: 'physiotherapy',
      },
    ];

    it('should return appointment statistics for a date', async () => {
      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce(mockAppointments as any);

      const result = await service.getAppointmentStats('2025-07-22');

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

    it('should return empty stats when no appointments found', async () => {
      jest.spyOn(repository, 'find').mockResolvedValueOnce([]);

      const result = await service.getAppointmentStats('2025-12-25');

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

    it('should handle all appointment statuses correctly', async () => {
      const allStatusAppointments = [
        {
          ...mockAppointment,
          status: AppointmentStatus.SCHEDULED,
          type: 'assessment',
        },
        {
          ...mockAppointment,
          status: AppointmentStatus.CHECKED_IN,
          type: 'assessment',
        },
        {
          ...mockAppointment,
          status: AppointmentStatus.IN_PROGRESS,
          type: 'physiotherapy',
        },
        {
          ...mockAppointment,
          status: AppointmentStatus.COMPLETED,
          type: 'physiotherapy',
        },
        {
          ...mockAppointment,
          status: AppointmentStatus.CANCELLED,
          type: 'assessment',
        },
      ];

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce(allStatusAppointments as any);

      const result = await service.getAppointmentStats('2025-07-22');

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

      await service.getAppointmentStats('2025-07-22');

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

    it('should increment missing_appointments_streak when marking appointment as MISSED without justification', async () => {
      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      };

      const updateDto = {
        status: AppointmentStatus.MISSED,
        absence_justified: false,
        absence_notes: '',
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);

      expect(patientRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockAppointment.patient_id },
      });
      expect(patientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          missing_appointments_streak: 1,
        }),
      );
    });

    it('should reset missing_appointments_streak to 0 when marking appointment as MISSED with justification', async () => {
      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      };

      const patientWithStreak = {
        ...mockPatient,
        missing_appointments_streak: 2,
      };
      jest
        .spyOn(patientRepository, 'findOne')
        .mockResolvedValueOnce(patientWithStreak);

      const updateDto = {
        status: AppointmentStatus.MISSED,
        absence_justified: true,
        absence_notes: 'Medical emergency',
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);

      expect(patientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          missing_appointments_streak: 0,
        }),
      );
    });

    it('should reset missing_appointments_streak to 0 when completing appointment', async () => {
      const patientWithStreak = {
        ...mockPatient,
        missing_appointments_streak: 3,
      };
      jest
        .spyOn(patientRepository, 'findOne')
        .mockResolvedValueOnce(patientWithStreak);

      const mockInProgressAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.IN_PROGRESS,
      };

      const updateDto = {
        status: AppointmentStatus.COMPLETED,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockInProgressAppointment);

      await service.update(1, updateDto);

      expect(patientRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          missing_appointments_streak: 0,
        }),
      );
    });

    it('should not update missing_appointments_streak for other status changes', async () => {
      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      };

      const updateDto = {
        status: AppointmentStatus.CHECKED_IN,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);

      // Patient repository should not be called for non-MISSED/COMPLETED statuses
      expect(patientRepository.findOne).not.toHaveBeenCalled();
    });

    it('should handle patient not found gracefully', async () => {
      const mockScheduledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.SCHEDULED,
      };

      jest.spyOn(patientRepository, 'findOne').mockResolvedValueOnce(null);
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const updateDto = {
        status: AppointmentStatus.MISSED,
        absence_justified: false,
      };

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockScheduledAppointment);

      await service.update(1, updateDto);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Patient 1 not found'),
      );
      consoleErrorSpy.mockRestore();
    });
  });

  describe('findUnresolvedPastDates', () => {
    it('should return empty when no unresolved past appointments exist', async () => {
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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      const result = await service.findUnresolvedPastDates();

      expect(result.hasUnresolved).toBe(false);
      expect(result.dates).toEqual([]);
      expect(mockQueryBuilder.where).toHaveBeenCalledWith(
        'appointment.scheduled_date < :today',
        expect.any(Object),
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'appointment.status NOT IN (:...resolvedStatuses)',
        {
          resolvedStatuses: [
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.MISSED,
          ],
        },
      );
    });

    it('should return correct dates with counts for unresolved appointments', async () => {
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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      await service.findUnresolvedPastDates();

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'appointment.scheduled_date',
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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

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

      jest
        .spyOn(repository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder as any);

      await service.findUnresolvedPastDates();

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'appointment.status NOT IN (:...resolvedStatuses)',
        {
          resolvedStatuses: [
            AppointmentStatus.COMPLETED,
            AppointmentStatus.CANCELLED,
            AppointmentStatus.MISSED,
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

    it('should successfully postpone a assessment appointment without updating sessions', async () => {
      const appointmentId = 1;
      const newDate = '2026-03-15';
      const assessmentAppointment = {
        ...mockAppointment,
        id: appointmentId,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(assessmentAppointment as Appointment);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest
        .spyOn(repository, 'save')
        .mockImplementation(async (appointment: any) => {
          return {
            ...appointment,
            scheduled_date: newDate,
          };
        });

      const mockHolidayService = module.get(HolidayService);
      jest
        .spyOn(mockHolidayService, 'isHolidayForTreatment')
        .mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(
        getRepositoryToken(ScheduleSetting),
      );
      jest
        .spyOn(mockScheduleSettingRepo, 'findOne')
        .mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      const getSessionsByAppointmentSpy = jest.spyOn(
        mockSessionService,
        'getSessionsByAppointment',
      );

      const result = await service.postpone(appointmentId, newDate);

      expect(result.scheduled_date).toBe(newDate);
      expect(result.notes).toContain('Rescheduled: 2026-02-20 → 2026-03-15');
      // Should NOT call SessionService for assessment appointments
      expect(getSessionsByAppointmentSpy).not.toHaveBeenCalled();
    });

    it('should postpone a physiotherapy appointment and update linked sessions', async () => {
      const appointmentId = 2;
      const newDate = '2026-03-15';
      const physiotherapyAppointment = {
        ...mockAppointment,
        id: appointmentId,
        type: AppointmentType.PHYSIOTHERAPY,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      const mockLinkedSessions: SessionResponseDto[] = [
        mockSessionResponseDto({
          id: 10,
          appointment_id: appointmentId,
          scheduled_date: '2026-02-20',
          session_number: 1,
        }),
        mockSessionResponseDto({
          id: 11,
          appointment_id: appointmentId,
          scheduled_date: '2026-02-20',
          session_number: 2,
        }),
      ];

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(physiotherapyAppointment as Appointment);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest
        .spyOn(repository, 'save')
        .mockImplementation(async (appointment: any) => {
          return { ...appointment };
        });

      const mockHolidayService = module.get(HolidayService);
      jest
        .spyOn(mockHolidayService, 'isHolidayForTreatment')
        .mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(
        getRepositoryToken(ScheduleSetting),
      );
      jest
        .spyOn(mockScheduleSettingRepo, 'findOne')
        .mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      const getSessionsByAppointmentSpy = jest
        .spyOn(mockSessionService, 'getSessionsByAppointment')
        .mockResolvedValue(mockLinkedSessions);
      const rescheduleSessionSpy = jest
        .spyOn(mockSessionService, 'rescheduleSession')
        .mockResolvedValue(
          mockSessionResponseDto({ id: 1, scheduled_date: newDate }),
        );

      const result = await service.postpone(appointmentId, newDate);

      expect(result.scheduled_date).toBe(newDate);
      expect(result.notes).toContain('Rescheduled: 2026-02-20 → 2026-03-15');

      // Should call SessionService for physiotherapy appointments
      expect(getSessionsByAppointmentSpy).toHaveBeenCalledWith(appointmentId);

      // Should reschedule both sessions
      expect(rescheduleSessionSpy).toHaveBeenCalledTimes(2);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(10, newDate);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(11, newDate);
    });

    it('should postpone a tens appointment and update linked sessions', async () => {
      const appointmentId = 3;
      const newDate = '2026-03-15';
      const tensAppointment = {
        ...mockAppointment,
        id: appointmentId,
        type: AppointmentType.TENS,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      const mockLinkedSessions: SessionResponseDto[] = [
        mockSessionResponseDto({
          id: 20,
          appointment_id: appointmentId,
          scheduled_date: '2026-02-20',
          session_number: 1,
        }),
      ];

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(tensAppointment as Appointment);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest
        .spyOn(repository, 'save')
        .mockImplementation(async (appointment: any) => {
          return { ...appointment };
        });

      const mockHolidayService = module.get(HolidayService);
      jest
        .spyOn(mockHolidayService, 'isHolidayForTreatment')
        .mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(
        getRepositoryToken(ScheduleSetting),
      );
      jest
        .spyOn(mockScheduleSettingRepo, 'findOne')
        .mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      const getSessionsByAppointmentSpy = jest
        .spyOn(mockSessionService, 'getSessionsByAppointment')
        .mockResolvedValue(mockLinkedSessions);
      const rescheduleSessionSpy = jest
        .spyOn(mockSessionService, 'rescheduleSession')
        .mockResolvedValue(
          mockSessionResponseDto({ id: 1, scheduled_date: newDate }),
        );

      const result = await service.postpone(appointmentId, newDate);

      expect(result.scheduled_date).toBe(newDate);

      // Should call SessionService for tens appointments
      expect(getSessionsByAppointmentSpy).toHaveBeenCalledWith(appointmentId);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(20, newDate);
    });

    it('should not update completed sessions when postponing', async () => {
      const appointmentId = 4;
      const newDate = '2026-03-15';
      const physiotherapyAppointment = {
        ...mockAppointment,
        id: appointmentId,
        type: AppointmentType.PHYSIOTHERAPY,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      const mockLinkedSessions: SessionResponseDto[] = [
        mockSessionResponseDto({
          id: 30,
          appointment_id: appointmentId,
          scheduled_date: '2026-02-20',
          status: SessionAppointmentStatus.COMPLETED,
          session_number: 1,
        }),
        mockSessionResponseDto({
          id: 31,
          appointment_id: appointmentId,
          scheduled_date: '2026-02-20',
          session_number: 2,
        }),
      ];

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(physiotherapyAppointment as Appointment);
      jest.spyOn(repository, 'count').mockResolvedValue(0);
      jest
        .spyOn(repository, 'save')
        .mockImplementation(async (appointment: any) => {
          return { ...appointment };
        });

      const mockHolidayService = module.get(HolidayService);
      jest
        .spyOn(mockHolidayService, 'isHolidayForTreatment')
        .mockResolvedValue(false);

      const mockScheduleSettingRepo = module.get(
        getRepositoryToken(ScheduleSetting),
      );
      jest
        .spyOn(mockScheduleSettingRepo, 'findOne')
        .mockResolvedValue(mockScheduleSetting);

      const mockSessionService = module.get(SessionService);
      jest
        .spyOn(mockSessionService, 'getSessionsByAppointment')
        .mockResolvedValue(mockLinkedSessions);
      const rescheduleSessionSpy = jest
        .spyOn(mockSessionService, 'rescheduleSession')
        .mockResolvedValue(
          mockSessionResponseDto({ id: 1, scheduled_date: newDate }),
        );

      await service.postpone(appointmentId, newDate);

      // Should only reschedule the scheduled session (id: 31), not the completed one (id: 30)
      expect(rescheduleSessionSpy).toHaveBeenCalledTimes(1);
      expect(rescheduleSessionSpy).toHaveBeenCalledWith(31, newDate);
      expect(rescheduleSessionSpy).not.toHaveBeenCalledWith(30, newDate);
    });

    it('should throw BadRequestException when postponing to a finalized day', async () => {
      const appointmentId = 1;
      const newDate = '2026-03-15';
      const assessmentAppointment = {
        ...mockAppointment,
        id: appointmentId,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2026-02-20',
        scheduled_time: '14:00:00',
      };

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValue(assessmentAppointment as Appointment);

      const dayFinalizationService = module.get(DayFinalizationService);
      jest
        .spyOn(dayFinalizationService, 'getFinalizationStatus')
        .mockResolvedValue({ finalization_date: newDate } as DayFinalization);

      await expect(service.postpone(appointmentId, newDate)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.postpone(appointmentId, newDate)).rejects.toThrow(
        'Day finalized. It is no longer possible to schedule appointments for this day.',
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
      const cancelledAppointment = {
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: PatientStatus.IN_TREATMENT,
        },
        type: AppointmentType.PHYSIOTHERAPY,
        status: AppointmentStatus.CANCELLED,
        scheduled_date: '2026-02-20',
        scheduled_time: '09:00:00',
        parent_appointment_id: null,
      };

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([cancelledAppointment as Appointment])
        .mockResolvedValueOnce([
          {
            rescheduled_from_appointment_id: 1,
            scheduled_date: '2026-03-22',
          } as Appointment,
        ]);

      await expect(
        service.reschedule({
          appointment_ids: [1],
          new_scheduled_date: '2026-04-01',
        }),
      ).rejects.toThrow(
        'This appointment has already been rescheduled for 03/22/2026',
      );
    });

    it('should throw BadRequestException when patient is not in treatment', async () => {
      const cancelledAppointment = {
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: PatientStatus.DISCHARGED,
        },
        type: AppointmentType.PHYSIOTHERAPY,
        status: AppointmentStatus.CANCELLED,
        scheduled_date: '2026-02-20',
        scheduled_time: '09:00:00',
        parent_appointment_id: null,
      };

      jest
        .spyOn(repository, 'find')
        .mockResolvedValue([cancelledAppointment as Appointment]);

      await expect(
        service.reschedule({
          appointment_ids: [1],
          new_scheduled_date: '2026-03-15',
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.reschedule({
          appointment_ids: [1],
          new_scheduled_date: '2026-03-15',
        }),
      ).rejects.toThrow(
        'Patient is not in treatment. Only patients in treatment can reschedule appointments.',
      );
    });

    it('should succeed rescheduling missed assessment appointment when patient has completed root assessment (skipCompletedRootAssessmentCheck used, e.g. end-of-day)', async () => {
      const newDate = '2026-03-15'; // Sunday
      const missedAssessmentAppointment = {
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: PatientStatus.IN_TREATMENT,
        },
        type: AppointmentType.ASSESSMENT,
        status: AppointmentStatus.MISSED,
        scheduled_date: '2026-02-20',
        scheduled_time: '09:00:00',
        parent_appointment_id: null,
        rescheduled_from_appointment_id: null,
      } as Appointment;

      jest
        .spyOn(repository, 'find')
        .mockResolvedValueOnce([missedAssessmentAppointment])
        .mockResolvedValueOnce([]); // alreadyRescheduled
      jest.spyOn(repository, 'count').mockResolvedValue(0); // concurrent slot count
      jest
        .spyOn(repository, 'create')
        .mockImplementation((dto) => ({ ...dto, id: 2 }) as Appointment);
      jest
        .spyOn(repository, 'save')
        .mockImplementation(async (att) => ({ ...att, id: 2 }) as Appointment);

      const dayFinalizationService = module.get(DayFinalizationService);
      jest
        .spyOn(dayFinalizationService, 'getFinalizationStatus')
        .mockResolvedValue(null);

      const holidayService = module.get(HolidayService);
      jest
        .spyOn(holidayService, 'isHolidayForTreatment')
        .mockResolvedValue(false);

      const scheduleSettingRepo = module.get<Repository<ScheduleSetting>>(
        getRepositoryToken(ScheduleSetting),
      );
      jest
        .spyOn(scheduleSettingRepo, 'findOne')
        .mockResolvedValue(mockScheduleSettingForReschedule);

      const result = await service.reschedule({
        appointment_ids: [1],
        new_scheduled_date: newDate,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        patient_id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: newDate,
        status: AppointmentStatus.SCHEDULED,
      });
      expect(repository.save).toHaveBeenCalled();
    });
  });

  describe('bulkPostpone', () => {
    it('should return structured result with successes and failures', async () => {
      const appointmentOne = {
        ...mockAppointment,
        id: 1,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2026-03-10',
      } as Appointment;
      const appointmentTwo = {
        ...mockAppointment,
        id: 2,
        type: AppointmentType.ASSESSMENT,
        scheduled_date: '2026-03-10',
      } as Appointment;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(appointmentOne)
        .mockResolvedValueOnce(appointmentTwo);
      jest
        .spyOn(service, 'postpone')
        .mockResolvedValueOnce({
          ...appointmentOne,
          scheduled_date: '2026-03-17',
        } as Appointment)
        .mockRejectedValueOnce(new Error('slot unavailable'));

      const result = await service.bulkPostpone([1, 2], '2026-03-17', false);

      expect(result.success_count).toBe(1);
      expect(result.failure_count).toBe(1);
      expect(result.successes).toEqual([
        {
          appointment_id: 1,
          message: 'Successfully postponed',
          new_date: '2026-03-17',
        },
      ]);
      expect(result.failures).toEqual([
        { appointment_id: 2, error: 'slot unavailable' },
      ]);
      expect(result.auto_rescheduled_returns).toEqual([]);
      expect(result.failed_return_reschedules).toEqual([]);
    });

    it('should keep furthest date when same assessment return is collected twice', async () => {
      const treatmentOne = {
        ...mockAppointment,
        id: 1,
        type: AppointmentType.PHYSIOTHERAPY,
        scheduled_date: '2026-03-10',
      } as Appointment;
      const treatmentTwo = {
        ...mockAppointment,
        id: 2,
        type: AppointmentType.TENS,
        scheduled_date: '2026-03-10',
      } as Appointment;
      const assessmentReturn = {
        ...mockAppointment,
        id: 900,
        type: AppointmentType.ASSESSMENT,
        patient_id: 1,
        patient: { id: 1, name: 'Test Patient' } as unknown as Patient,
        scheduled_date: '2026-03-17',
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(treatmentOne)
        .mockResolvedValueOnce(treatmentTwo)
        .mockResolvedValueOnce(assessmentReturn);
      jest
        .spyOn(service, 'postpone')
        .mockResolvedValueOnce({
          ...treatmentOne,
          scheduled_date: '2026-03-24',
        } as Appointment)
        .mockResolvedValueOnce({
          ...treatmentTwo,
          scheduled_date: '2026-03-24',
        } as Appointment)
        .mockResolvedValueOnce({
          ...assessmentReturn,
          scheduled_date: '2026-04-14',
        } as Appointment);

      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(11)
        .mockResolvedValueOnce(22);

      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-03-10')
        .mockResolvedValueOnce('2026-03-10');

      const serviceWithReturnFinder = service as unknown as {
        findReturnAssessmentAppointmentsForTreatment: (
          treatmentSessionId: number,
          minScheduledDate: string,
        ) => Promise<Appointment[]>;
      };
      jest
        .spyOn(
          serviceWithReturnFinder,
          'findReturnAssessmentAppointmentsForTreatment',
        )
        .mockResolvedValue([assessmentReturn]);

      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          appointment_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 1,
          return_when_treatment_complete: true,
        })
        .mockResolvedValueOnce({
          appointment_id: 100,
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
          appointment_id: 900,
          patient_id: 1,
          patient_name: 'Test Patient',
          old_date: '2026-03-17',
          new_date: '2026-04-14',
        },
      ]);
      expect(result.failed_return_reschedules).toEqual([]);
      expect(service.postpone).toHaveBeenCalledWith(900, '2026-04-14');
    });

    it('should report failed return reschedules without rolling back main postpones', async () => {
      const treatmentAppointment = {
        ...mockAppointment,
        id: 1,
        type: AppointmentType.PHYSIOTHERAPY,
        scheduled_date: '2026-03-10',
      } as Appointment;
      const assessmentReturn = {
        ...mockAppointment,
        id: 901,
        type: AppointmentType.ASSESSMENT,
        patient_id: 1,
        patient: { id: 1, name: 'Test Patient' } as unknown as Patient,
        scheduled_date: '2026-03-17',
        status: AppointmentStatus.SCHEDULED,
      } as Appointment;

      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(treatmentAppointment)
        .mockResolvedValueOnce(assessmentReturn);
      jest
        .spyOn(service, 'postpone')
        .mockResolvedValueOnce({
          ...treatmentAppointment,
          scheduled_date: '2026-03-24',
        } as Appointment)
        .mockRejectedValueOnce(new Error('holiday blocked'));
      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(33);

      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-03-10');

      const serviceWithReturnFinder = service as unknown as {
        findReturnAssessmentAppointmentsForTreatment: (
          treatmentSessionId: number,
          minScheduledDate: string,
        ) => Promise<Appointment[]>;
      };
      jest
        .spyOn(
          serviceWithReturnFinder,
          'findReturnAssessmentAppointmentsForTreatment',
        )
        .mockResolvedValue([assessmentReturn]);

      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          appointment_id: 100,
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
        { appointment_id: 901, error: 'holiday blocked' },
      ]);
    });
  });

  describe('recomputeReturnForEpisode', () => {
    const treatmentAppointment = {
      ...mockAppointment,
      id: 5,
      type: AppointmentType.PHYSIOTHERAPY,
      scheduled_date: '2026-06-03',
    } as Appointment;

    const returnAppointment = {
      ...mockAppointment,
      id: 900,
      type: AppointmentType.ASSESSMENT,
      patient_id: 1,
      patient: { id: 1, name: 'Test Patient' } as unknown as Patient,
      scheduled_date: '2026-06-24',
      status: AppointmentStatus.SCHEDULED,
    } as Appointment;

    it('should return rescheduled=false when no treatment is linked', async () => {
      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(null);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should return rescheduled=false when return_when_treatment_complete=false and return_weeks=0', async () => {
      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          appointment_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 0,
          return_when_treatment_complete: false,
        });

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should return rescheduled=false when no scheduled sessions exist for consultation treatments', async () => {
      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          appointment_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 1,
          return_when_treatment_complete: true,
        });
      jest
        .spyOn(treatmentService, 'getTreatmentIdsByConsultationId')
        .mockResolvedValueOnce([10, 11]);
      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValue(null);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should return rescheduled=false when return is already at the computed date', async () => {
      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          appointment_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 1,
          return_when_treatment_complete: true,
        });
      jest
        .spyOn(treatmentService, 'getTreatmentIdsByConsultationId')
        .mockResolvedValueOnce([10]);
      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-06-24');
      jest
        .spyOn(service, 'findNextSchedulableDate')
        .mockResolvedValueOnce('2026-07-01');

      const serviceWithFinder = service as unknown as {
        findReturnAssessmentAppointmentsForTreatment: (
          tid: number,
          minDate: string,
        ) => Promise<Appointment[]>;
      };
      jest
        .spyOn(serviceWithFinder, 'findReturnAssessmentAppointmentsForTreatment')
        .mockResolvedValueOnce([
          { ...returnAppointment, scheduled_date: '2026-07-01' } as Appointment,
        ]);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({ rescheduled: false });
    });

    it('should recompute return date using max session across all consultation treatments', async () => {
      // Two treatments: T1 last session Jun 24, T2 last session Jun 17. Max = Jun 24. return_weeks=1 → Jul 1.
      jest
        .spyOn(service, 'getTreatmentIdForAppointmentId')
        .mockResolvedValueOnce(10);
      const treatmentService = module.get(TreatmentService);
      jest
        .spyOn(treatmentService, 'getSessionWithReturnConfig')
        .mockResolvedValueOnce({
          appointment_id: 100,
          patient_id: 1,
          consultation_id: 50,
          return_weeks: 1,
          return_when_treatment_complete: true,
        });
      jest
        .spyOn(treatmentService, 'getTreatmentIdsByConsultationId')
        .mockResolvedValueOnce([10, 11]);
      const recordService = module.get(SessionService);
      jest
        .spyOn(recordService, 'getMaxScheduledDateForTreatment')
        .mockResolvedValueOnce('2026-06-24') // T1
        .mockResolvedValueOnce('2026-06-17'); // T2
      jest
        .spyOn(service, 'findNextSchedulableDate')
        .mockResolvedValueOnce('2026-07-01');

      const serviceWithFinder = service as unknown as {
        findReturnAssessmentAppointmentsForTreatment: (
          tid: number,
          minDate: string,
        ) => Promise<Appointment[]>;
      };
      jest
        .spyOn(serviceWithFinder, 'findReturnAssessmentAppointmentsForTreatment')
        .mockResolvedValueOnce([returnAppointment]);

      jest.spyOn(service, 'findOne').mockResolvedValueOnce(returnAppointment);
      jest.spyOn(service, 'postpone').mockResolvedValueOnce({
        ...returnAppointment,
        scheduled_date: '2026-07-01',
      } as Appointment);

      const result = await service.recomputeReturnForEpisode(5);

      expect(result).toEqual({
        rescheduled: true,
        appointment_id: 900,
        patient_id: 1,
        patient_name: 'Test Patient',
        old_date: '2026-06-24',
        new_date: '2026-07-01',
      });
      expect(
        recordService.getMaxScheduledDateForTreatment,
      ).toHaveBeenCalledWith(10);
      expect(
        recordService.getMaxScheduledDateForTreatment,
      ).toHaveBeenCalledWith(11);
      expect(service.findNextSchedulableDate).toHaveBeenCalledWith(
        '2026-07-01',
        AppointmentType.ASSESSMENT,
      );
    });
  });
});
