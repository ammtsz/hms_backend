import { Test, TestingModule } from '@nestjs/testing';
import { PatientService } from '../patient.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Patient } from '../../entities/patient.entity';
import { Appointment } from '../../entities/appointment.entity';
import { SystemOption } from '../../entities/system-option.entity';
import { CreatePatientDto, UpdatePatientDto } from '../../dtos/patient.dto';
import {
  PatientPriority,
  PatientStatus,
  AppointmentStatus,
} from '../../common/enums';
import { Repository, DeleteResult, In, Not } from 'typeorm';
import { NotFoundException } from '@nestjs/common';
import {
  ValidationException,
  DuplicatePatientException,
  InvalidPatientPriorityException,
  PatientStatusUpdateException,
  PatientHasActiveAppointmentsException,
} from '../../common/exceptions';
import * as timezoneUtils from '../../common/utils/timezone.utils';
import { AppointmentService } from '../appointment.service';
import { TreatmentService } from '../treatment.service';
import { PatientNoteService } from '../patient-note.service';

describe('PatientService', () => {
  let service: PatientService;
  let repository: Repository<Patient>;

  const mockAppointmentService = {
    cancelOpenAppointmentsForPatient: jest.fn().mockResolvedValue([]),
  };

  const mockTreatmentService = {
    getTreatmentsByPatient: jest.fn().mockResolvedValue([]),
    cancelTreatment: jest.fn().mockResolvedValue(undefined),
  };

  const mockPatientNoteService = {
    create: jest.fn().mockResolvedValue(undefined),
  };

  const mockPatient = {
    id: 1,
    name: 'John Doe',
    phone: '(555) 123-4567',
    priority: PatientPriority.LEVEL_3,
    patient_status: PatientStatus.IN_TREATMENT,
    birth_date: '1990-01-01',
    main_concern: 'Test complaint',
    start_date: '2025-07-22',
    discharge_date: null,
    missing_appointments_streak: 0,
    timezone: 'America/Sao_Paulo',
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  };

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => ({
      ...dto,
      patient_status: dto.patient_status || PatientStatus.IN_TREATMENT,
    })),
    save: jest.fn().mockImplementation((patient) =>
      Promise.resolve({
        id: 1,
        ...patient,
        patient_status: PatientStatus.IN_TREATMENT,
      }),
    ),
    merge: jest.fn().mockImplementation((obj, dto) => ({ ...obj, ...dto })),
    find: jest.fn().mockResolvedValue([mockPatient]),
    findOne: jest.fn().mockResolvedValue(mockPatient),
    update: jest.fn().mockResolvedValue(true),
    delete: jest
      .fn()
      .mockResolvedValue({ affected: 1, raw: {} } as DeleteResult),
  };

  const mockActivePriorityRows = [
    { value: '1' },
    { value: '2' },
    { value: '3' },
    { value: '4' },
    { value: '5' },
  ];
  const mockSystemOptionRepository = {
    find: jest.fn().mockResolvedValue(mockActivePriorityRows),
  };

  const mockGetRawOne = jest.fn().mockResolvedValue({ maxDate: null });
  const mockAppointmentRepository = {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    createQueryBuilder: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: mockGetRawOne,
    }),
  };

  beforeEach(async () => {
    mockAppointmentService.cancelOpenAppointmentsForPatient.mockResolvedValue([]);
    mockTreatmentService.getTreatmentsByPatient.mockResolvedValue([]);
    mockTreatmentService.cancelTreatment.mockResolvedValue(undefined);
    mockPatientNoteService.create.mockResolvedValue(undefined);
    mockAppointmentRepository.findOne.mockResolvedValue(null);
    mockSystemOptionRepository.find.mockResolvedValue(mockActivePriorityRows);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientService,
        {
          provide: getRepositoryToken(Patient),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(SystemOption),
          useValue: mockSystemOptionRepository,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: mockAppointmentRepository,
        },
        {
          provide: AppointmentService,
          useValue: mockAppointmentService,
        },
        {
          provide: TreatmentService,
          useValue: mockTreatmentService,
        },
        {
          provide: PatientNoteService,
          useValue: mockPatientNoteService,
        },
      ],
    }).compile();

    service = module.get<PatientService>(PatientService);
    repository = module.get<Repository<Patient>>(getRepositoryToken(Patient));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a new patient', async () => {
      const createDto: CreatePatientDto = {
        name: 'John Doe',
        phone: '(555) 123-4567',
        priority: PatientPriority.LEVEL_3,
      };

      // Mock findOne to return null (no existing patient)
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      const mockDate = '2026-02-04';
      jest
        .spyOn(timezoneUtils, 'getCurrentDateTimeInTimezone')
        .mockReturnValue({ date: mockDate, time: '10:00:00' });

      const result = await service.create(createDto);

      expect(result).toEqual({
        id: expect.any(Number),
        ...createDto,
        timezone: timezoneUtils.DEFAULT_TIMEZONE,
        start_date: mockDate,
        patient_status: PatientStatus.IN_TREATMENT,
      });
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDto,
          start_date: mockDate,
        }),
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw DuplicatePatientException when patient already exists', async () => {
      const createDto: CreatePatientDto = {
        name: 'John Doe',
        phone: '(555) 123-4567',
        priority: PatientPriority.LEVEL_3,
      };

      // Mock findOne to return existing patient
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(mockPatient);

      await expect(service.create(createDto)).rejects.toThrow(
        DuplicatePatientException,
      );
    });

    it('should throw InvalidPatientPriorityException for invalid priority', async () => {
      const createDto: CreatePatientDto = {
        name: 'John Doe',
        phone: '(555) 123-4567',
        priority: 'INVALID_PRIORITY' as any, // Force invalid priority
      };

      // Mock findOne to return null (no existing patient)
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      await expect(service.create(createDto)).rejects.toThrow(
        InvalidPatientPriorityException,
      );
    });

    it('should set start_date based on patient timezone (not database server timezone)', async () => {
      const createDto: CreatePatientDto = {
        name: 'Jane Doe',
        phone: '(555) 888-7777',
        priority: PatientPriority.LEVEL_3,
        timezone: 'America/Sao_Paulo',
      };

      // Mock findOne to return null (no existing patient)
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      // Mock getCurrentDateTimeInTimezone to return a specific date
      const mockDate = '2026-02-04';
      jest
        .spyOn(timezoneUtils, 'getCurrentDateTimeInTimezone')
        .mockReturnValue({ date: mockDate, time: '14:30:00' });

      const result = await service.create(createDto);

      // Verify that getCurrentDateTimeInTimezone was called with the patient's timezone
      expect(timezoneUtils.getCurrentDateTimeInTimezone).toHaveBeenCalledWith(
        'America/Sao_Paulo',
      );

      // Verify that start_date was set to the timezone-aware date
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          ...createDto,
          start_date: mockDate,
        }),
      );
    });

    it('should use default timezone when creating patient without explicit timezone', async () => {
      const createDto: CreatePatientDto = {
        name: 'Bob Smith',
        phone: '(718) 456-7890',
        priority: PatientPriority.LEVEL_3,
      };

      // Mock findOne to return null (no existing patient)
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      const mockDate = '2026-02-04';
      jest
        .spyOn(timezoneUtils, 'getCurrentDateTimeInTimezone')
        .mockReturnValue({ date: mockDate, time: '10:00:00' });

      await service.create(createDto);

      // Should use DEFAULT_TIMEZONE
      expect(timezoneUtils.getCurrentDateTimeInTimezone).toHaveBeenCalledWith(
        timezoneUtils.DEFAULT_TIMEZONE,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of patients', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockPatient]);
      expect(repository.find).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single patient', async () => {
      const result = await service.findOne(1);

      expect(result).toEqual(mockPatient);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });

  describe('findOne error cases', () => {
    it('should throw NotFoundException when patient not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should remove a patient', async () => {
      await service.remove(1);
      expect(repository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when patient not found during removal', async () => {
      jest
        .spyOn(repository, 'delete')
        .mockResolvedValueOnce({ affected: 0, raw: {} } as DeleteResult);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a patient', async () => {
      const updateDto: Partial<UpdatePatientDto> = {
        name: 'John Doe Updated',
        phone: '(555) 123-4567',
        priority: PatientPriority.LEVEL_3,
      };

      await service.update(1, updateDto as UpdatePatientDto);

      expect(repository.merge).toHaveBeenCalledWith(mockPatient, updateDto);
      expect(repository.findOne).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ValidationException when no fields provided', async () => {
      const updateDto: Partial<UpdatePatientDto> = {};

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should update treatment status with valid transition (non-D/C)', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment);
      mockAppointmentRepository.count.mockResolvedValueOnce(0);
      const updateDto: Partial<UpdatePatientDto> = {
        patient_status: PatientStatus.NEW_PATIENT,
      };

      await service.update(1, updateDto as UpdatePatientDto);

      expect(repository.merge).toHaveBeenCalledWith(
        patientInTreatment,
        updateDto,
      );
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw PatientStatusUpdateException for invalid transition', async () => {
      const patientDischarged = {
        ...mockPatient,
        patient_status: PatientStatus.DISCHARGED,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientDischarged);
      const updateDto: Partial<UpdatePatientDto> = {
        patient_status: PatientStatus.NEW_PATIENT,
      };

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(PatientStatusUpdateException);
    });

    it('should throw InvalidPatientPriorityException for invalid priority', async () => {
      const updateDto: Partial<UpdatePatientDto> = {
        priority: 'INVALID_PRIORITY' as PatientPriority,
      };

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(InvalidPatientPriorityException);
    });

    it('should update priority with valid value', async () => {
      const updateDto: Partial<UpdatePatientDto> = {
        priority: PatientPriority.LEVEL_1,
      };

      await service.update(1, updateDto as UpdatePatientDto);

      expect(repository.merge).toHaveBeenCalledWith(mockPatient, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ValidationException when discharge_date is before last completed appointment', async () => {
      mockGetRawOne.mockResolvedValueOnce({ maxDate: '2025-02-15' });
      const updateDto: Partial<UpdatePatientDto> = {
        discharge_date: '2025-02-01',
      };

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(ValidationException);
    });

    it('should allow discharge_date when on or after last completed appointment', async () => {
      mockGetRawOne.mockResolvedValueOnce({ maxDate: '2025-02-15' });
      const updateDto: Partial<UpdatePatientDto> = {
        discharge_date: '2025-02-15',
      };

      await service.update(1, updateDto as UpdatePatientDto);

      expect(repository.merge).toHaveBeenCalledWith(mockPatient, updateDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ValidationException when changing to NEW_PATIENT and patient has completed appointments', async () => {
      mockAppointmentRepository.count.mockResolvedValueOnce(1);
      const updateDto: Partial<UpdatePatientDto> = {
        patient_status: PatientStatus.NEW_PATIENT,
      };
      const patientAsNew = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(patientAsNew);

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(ValidationException);

      expect(mockAppointmentRepository.count).toHaveBeenCalledWith({
        where: { patient_id: 1, status: AppointmentStatus.COMPLETED },
      });
    });

    it('should allow changing to NEW_PATIENT when patient has no completed appointments', async () => {
      mockAppointmentRepository.count.mockResolvedValueOnce(0);
      const updateDto: Partial<UpdatePatientDto> = {
        patient_status: PatientStatus.NEW_PATIENT,
      };
      const patientAsNew = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(patientAsNew);

      await service.update(1, updateDto as UpdatePatientDto);

      expect(repository.merge).toHaveBeenCalled();
      expect(repository.save).toHaveBeenCalled();
    });

    it('should throw ValidationException when transitioning to DISCHARGED via update', async () => {
      const updateDto: Partial<UpdatePatientDto> = {
        patient_status: PatientStatus.DISCHARGED,
      };

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(ValidationException);
      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(
        'Use setPatientStatus to set status to Discharged (D) or Consecutive no-shows (C).',
      );
      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).not.toHaveBeenCalled();
    });

    it('should throw ValidationException when transitioning to CONSECUTIVE_NO_SHOWS via update', async () => {
      const updateDto: Partial<UpdatePatientDto> = {
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };

      await expect(
        service.update(1, updateDto as UpdatePatientDto),
      ).rejects.toThrow(ValidationException);
      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).not.toHaveBeenCalled();
    });

    it('should throw PatientStatusUpdateException when transitioning from DISCHARGED to CONSECUTIVE_NO_SHOWS via setPatientStatus', async () => {
      const patientDischarged = {
        ...mockPatient,
        patient_status: PatientStatus.DISCHARGED,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientDischarged)
        .mockResolvedValueOnce(patientDischarged);

      await expect(
        service.setPatientStatus(1, PatientStatus.CONSECUTIVE_NO_SHOWS),
      ).rejects.toThrow(PatientStatusUpdateException);
    });

    it('should throw PatientStatusUpdateException when transitioning from CONSECUTIVE_NO_SHOWS to DISCHARGED via setPatientStatus', async () => {
      const patientAbsent = {
        ...mockPatient,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientAbsent)
        .mockResolvedValueOnce(patientAbsent);

      await expect(
        service.setPatientStatus(1, PatientStatus.DISCHARGED),
      ).rejects.toThrow(PatientStatusUpdateException);
    });
  });

  describe('setPatientStatus D/C transition behavior', () => {
    beforeEach(() => {
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockClear();
      mockTreatmentService.getTreatmentsByPatient.mockClear();
      mockTreatmentService.cancelTreatment.mockClear();
      mockRepository.findOne.mockResolvedValue(mockPatient);
    });

    it('should cancel open appointments and treatment sessions and return patient and list when transitioning to CONSECUTIVE_NO_SHOWS', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment)
        .mockResolvedValueOnce(patientInTreatment);
      mockRepository.save.mockResolvedValueOnce({
        ...patientInTreatment,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      });
      const cancelledList = [
        { id: 10, type: 'assessment', scheduled_date: '2024-01-20' },
      ];
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockResolvedValueOnce(
        cancelledList,
      );

      const result = await service.setPatientStatus(
        1,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        {
          cancellationReason: 'Consecutive no-shows - test',
        },
      );

      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).toHaveBeenCalledWith(1, 'Consecutive no-shows - test', {
        excludeAppointmentIds: undefined,
      });
      expect(mockPatientNoteService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          category: 'status_change',
        }),
      );
      expect(mockTreatmentService.getTreatmentsByPatient).toHaveBeenCalledWith(
        1,
      );
      expect(result.patient.patient_status).toBe(
        PatientStatus.CONSECUTIVE_NO_SHOWS,
      );
      expect(result.cancelledAppointments).toEqual(cancelledList);
    });

    it('should call cancelTreatment with cancelLinkedOpenAppointments: false when transitioning', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment)
        .mockResolvedValueOnce(patientInTreatment);
      mockRepository.save.mockResolvedValueOnce({
        ...patientInTreatment,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      });
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockResolvedValueOnce(
        [],
      );
      mockTreatmentService.getTreatmentsByPatient.mockResolvedValueOnce([
        { id: 5, status: 'active', patient_id: 1 },
      ]);

      await service.setPatientStatus(1, PatientStatus.CONSECUTIVE_NO_SHOWS);

      expect(mockTreatmentService.cancelTreatment).toHaveBeenCalledWith(
        5,
        expect.any(String),
        { cancelLinkedOpenAppointments: false },
      );
    });

    it('should set discharge_date when transitioning to DISCHARGED', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment)
        .mockResolvedValueOnce(patientInTreatment);
      const savedPatient = {
        ...patientInTreatment,
        patient_status: PatientStatus.DISCHARGED,
        discharge_date: '2026-03-04',
      };
      mockRepository.save.mockResolvedValueOnce(savedPatient);
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockResolvedValueOnce(
        [],
      );

      const result = await service.setPatientStatus(
        1,
        PatientStatus.DISCHARGED,
      );

      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).toHaveBeenLastCalledWith(1, 'Discharged', {
        excludeAppointmentIds: undefined,
      });
      expect(mockPatientNoteService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          category: 'status_change',
        }),
      );
      expect(result.patient.patient_status).toBe(PatientStatus.DISCHARGED);
      expect(result.patient.discharge_date).toBeDefined();
    });

    it('should trim cancellationReason before cancelling and writing note', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment)
        .mockResolvedValueOnce(patientInTreatment);
      mockRepository.save.mockResolvedValueOnce({
        ...patientInTreatment,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      });

      await service.setPatientStatus(1, PatientStatus.CONSECUTIVE_NO_SHOWS, {
        cancellationReason: '  Custom reason  ',
      });

      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).toHaveBeenCalledWith(1, 'Custom reason', {
        excludeAppointmentIds: undefined,
      });
      expect(mockPatientNoteService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          note_content: expect.stringContaining('Reason: Custom reason'),
        }),
      );
    });

    it('should use triggerAppointmentIds date in generated note when provided', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment)
        .mockResolvedValueOnce(patientInTreatment);
      mockRepository.save.mockResolvedValueOnce({
        ...patientInTreatment,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      });
      mockAppointmentRepository.findOne.mockResolvedValueOnce({
        id: 44,
        scheduled_date: '2026-03-10',
      });

      await service.setPatientStatus(1, PatientStatus.CONSECUTIVE_NO_SHOWS, {
        triggerAppointmentIds: [44],
      });

      expect(mockAppointmentRepository.findOne).toHaveBeenCalledWith({
        where: { id: 44 },
      });
      expect(mockPatientNoteService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          note_content: expect.stringContaining('on 03/10/2026.'),
        }),
      );
    });
  });

  describe('setPatientStatus', () => {
    beforeEach(() => {
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockClear();
      mockRepository.merge.mockClear();
      mockRepository.save.mockClear();
      mockRepository.findOne.mockResolvedValue(mockPatient);
    });

    it('should return unchanged when patient already has target status (D)', async () => {
      const patientDischarged = {
        ...mockPatient,
        patient_status: PatientStatus.DISCHARGED,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientDischarged);

      const result = await service.setPatientStatus(
        1,
        PatientStatus.DISCHARGED,
      );

      expect(result.patient).toEqual(patientDischarged);
      expect(result.unchanged).toBe(true);
      expect(result.cancelledAppointments).toEqual([]);
      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).not.toHaveBeenCalled();
    });

    it('should return unchanged when patient already has target status (M)', async () => {
      const patientAbsent = {
        ...mockPatient,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(patientAbsent);

      const result = await service.setPatientStatus(
        1,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
      );

      expect(result.unchanged).toBe(true);
      expect(result.cancelledAppointments).toEqual([]);
      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).not.toHaveBeenCalled();
    });

    it('should call internal transition and return result when transitioning to CONSECUTIVE_NO_SHOWS', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment);
      const savedPatient = {
        ...patientInTreatment,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      mockRepository.save.mockResolvedValueOnce(savedPatient);
      const cancelledList = [
        { id: 10, type: 'assessment', scheduled_date: '2024-01-20' },
      ];
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockResolvedValueOnce(
        cancelledList,
      );

      const result = await service.setPatientStatus(
        1,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        {
          cancellationReason: 'Test reason',
        },
      );

      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).toHaveBeenCalledWith(1, 'Test reason', {
        excludeAppointmentIds: undefined,
      });
      expect(mockPatientNoteService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          category: 'status_change',
        }),
      );
      expect(result.patient.patient_status).toBe(
        PatientStatus.CONSECUTIVE_NO_SHOWS,
      );
      expect(result.cancelledAppointments).toEqual(cancelledList);
      expect(result.unchanged).toBe(false);
    });

    it('should pass excludeAppointmentIds to transition when provided', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment)
        .mockResolvedValueOnce(patientInTreatment);
      mockRepository.save.mockResolvedValueOnce({
        ...patientInTreatment,
        patient_status: PatientStatus.DISCHARGED,
      });
      mockAppointmentService.cancelOpenAppointmentsForPatient.mockResolvedValueOnce(
        [],
      );

      await service.setPatientStatus(1, PatientStatus.DISCHARGED, {
        excludeAppointmentIds: [100],
      });

      expect(
        mockAppointmentService.cancelOpenAppointmentsForPatient,
      ).toHaveBeenCalledWith(1, 'Discharged', {
        excludeAppointmentIds: [100],
      });
      expect(mockPatientNoteService.create).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          category: 'status_change',
        }),
      );
    });

    it('should return unchanged when patient already has target status N', async () => {
      mockRepository.merge.mockClear();
      const patientNew = {
        ...mockPatient,
        patient_status: PatientStatus.NEW_PATIENT,
      };
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(patientNew);

      const result = await service.setPatientStatus(
        1,
        PatientStatus.NEW_PATIENT,
      );

      expect(result.patient).toEqual(patientNew);
      expect(result.unchanged).toBe(true);
      expect(mockRepository.merge).not.toHaveBeenCalled();
    });

    it('should validate and update when transitioning to N and patient has no completed appointments', async () => {
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment);
      mockAppointmentRepository.count.mockResolvedValueOnce(0);
      const savedPatient = {
        ...patientInTreatment,
        patient_status: PatientStatus.NEW_PATIENT,
      };
      mockRepository.save.mockResolvedValueOnce(savedPatient);

      const result = await service.setPatientStatus(
        1,
        PatientStatus.NEW_PATIENT,
      );

      expect(repository.merge).toHaveBeenCalledWith(patientInTreatment, {
        patient_status: PatientStatus.NEW_PATIENT,
      });
      expect(result.patient.patient_status).toBe(PatientStatus.NEW_PATIENT);
      expect(result.unchanged).toBe(false);
    });

    it('should throw when transitioning to N and patient has completed appointments', async () => {
      mockRepository.save.mockClear();
      const patientInTreatment = {
        ...mockPatient,
        patient_status: PatientStatus.IN_TREATMENT,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientInTreatment);
      mockAppointmentRepository.count.mockResolvedValueOnce(1);

      await expect(
        service.setPatientStatus(1, PatientStatus.NEW_PATIENT),
      ).rejects.toThrow(ValidationException);
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw PatientStatusUpdateException for invalid N/T transition', async () => {
      const patientDischarged = {
        ...mockPatient,
        patient_status: PatientStatus.DISCHARGED,
      };
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(patientDischarged);

      await expect(
        service.setPatientStatus(1, PatientStatus.NEW_PATIENT),
      ).rejects.toThrow(PatientStatusUpdateException);
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      mockAppointmentRepository.count.mockReset();
      mockAppointmentRepository.count.mockResolvedValue(0);
    });

    it('should remove a patient when there are no blocking appointments', async () => {
      await service.remove(1);

      expect(mockAppointmentRepository.count).toHaveBeenCalledWith({
        where: {
          patient_id: 1,
          status: Not(
            In([AppointmentStatus.CANCELLED, AppointmentStatus.MISSED]),
          ),
        },
      });
      expect(repository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw PatientHasActiveAppointmentsException when patient has blocking appointments', async () => {
      mockAppointmentRepository.count.mockResolvedValue(2);

      await expect(service.remove(1)).rejects.toThrow(
        PatientHasActiveAppointmentsException,
      );
    });

    it('should throw NotFoundException when patient not found during removal', async () => {
      jest
        .spyOn(repository, 'delete')
        .mockResolvedValueOnce({ affected: 0, raw: {} } as DeleteResult);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
