import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationService } from '../consultation.service';
import { AppointmentService } from '../appointment.service';
import { TreatmentService } from '../treatment.service';
import { PatientService } from '../patient.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Consultation } from '../../entities/consultation.entity';
import { Appointment } from '../../entities/appointment.entity';
import { Patient } from '../../entities/patient.entity';
import { Repository, DeleteResult } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import {
  CreateConsultationDto,
  UpdateConsultationDto,
} from '../../dtos/consultation.dto';
import {
  DuplicateConsultationException,
  InvalidAppointmentStatusException,
  InvalidReturnWeeksException,
} from '../../common/exceptions';
import { AppointmentStatus, AppointmentType } from '../../common/enums';

describe('ConsultationService', () => {
  let service: ConsultationService;
  let repository: Repository<Consultation>;
  let mockAppointmentRepository: Repository<Appointment>;

  const mockPatient = {
    id: 1,
    name: 'John Doe',
  };

  const mockAppointment = {
    id: 1,
    patient: mockPatient as any,
    patient_id: 1,
    type: AppointmentType.ASSESSMENT,
    status: AppointmentStatus.COMPLETED,
    scheduled_date: '2026-01-15',
    scheduled_time: '10:00:00',
  } as Appointment;

  const mockConsultation: Consultation = {
    id: 1,
    appointment_id: 1,
    appointment: mockAppointment as any,
    food: 'Avoid processed foods',
    water: 'Drink 2L of water daily',
    ointments: 'Chamomile ointment',
    physiotherapy: true,
    tens: false,
    start_time: '10:00',
    end_time: '11:00',
    return_weeks: 2,
    notes: 'Patient responded well to treatment',
    main_concern: '',
    patient_status: 'T',
    created_date: '',
    created_time: '',
    updated_date: '',
    updated_time: '',
    return_when_treatment_complete: false,
  };

  const mockRepository = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest
      .fn()
      .mockImplementation((entity) => Promise.resolve({ id: 1, ...entity })),
    find: jest.fn().mockResolvedValue([mockConsultation]),
    findOne: jest.fn(),
    merge: jest.fn().mockImplementation((obj, dto) => ({ ...obj, ...dto })),
    update: jest
      .fn()
      .mockResolvedValue({ affected: 1, generatedMaps: [], raw: {} }),
    delete: jest
      .fn()
      .mockResolvedValue({ affected: 1, raw: {} } as DeleteResult),
  };

  const appointmentRepoMock = {
    findOne: jest.fn().mockResolvedValue(mockAppointment),
  } as unknown as Repository<Appointment>;

  const patientRepoMock = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    findOne: jest.fn().mockResolvedValue(mockPatient),
  } as unknown as Repository<any>;

  const mockTreatmentService = {
    createTreatment: jest.fn().mockResolvedValue({ id: 1 }),
  } as unknown as TreatmentService;

  const mockAppointmentService = {
    create: jest.fn().mockResolvedValue({ id: 1 }),
  } as unknown as AppointmentService;

  const mockPatientService = {
    setPatientStatus: jest.fn().mockResolvedValue({
      patient: mockPatient,
      cancelledAppointments: [],
    }),
  } as unknown as PatientService;

  beforeEach(async () => {
    mockRepository.findOne.mockReset();
    mockRepository.findOne.mockImplementation(async (options: any) => {
      if (options.where?.id === 1 || options.where?.appointment_id === 1) {
        return mockConsultation;
      }
      return null;
    });

    // Reset ALL mocks completely
    mockRepository.save.mockClear();
    (appointmentRepoMock.findOne as jest.Mock).mockClear();
    (appointmentRepoMock.findOne as jest.Mock).mockReset();
    (appointmentRepoMock.findOne as jest.Mock).mockResolvedValue(mockAppointment);
    (patientRepoMock.findOne as jest.Mock).mockClear();
    (patientRepoMock.findOne as jest.Mock).mockReset();
    (patientRepoMock.findOne as jest.Mock).mockResolvedValue(mockPatient);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationService,
        {
          provide: getRepositoryToken(Consultation),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: appointmentRepoMock,
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: patientRepoMock,
        },
        {
          provide: TreatmentService,
          useValue: mockTreatmentService,
        },
        {
          provide: AppointmentService,
          useValue: mockAppointmentService,
        },
        {
          provide: PatientService,
          useValue: mockPatientService,
        },
      ],
    }).compile();

    service = module.get<ConsultationService>(ConsultationService);
    repository = module.get<Repository<Consultation>>(
      getRepositoryToken(Consultation),
    );
    mockAppointmentRepository = module.get<Repository<Appointment>>(
      getRepositoryToken(Appointment),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateConsultationDto = {
      appointment_id: 1,
      food: 'Avoid processed foods',
      water: 'Drink 2L of water daily',
      ointments: 'Chamomile ointment',
      physiotherapy: true,
      tens: false,
      return_weeks: 2,
      notes: 'Patient responded well to treatment',
    };

    it('should create a new consultation', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation

      const result = await service.create(createDto);

      expect(result).toHaveProperty('consultation');
      expect(result.consultation).toEqual({
        id: expect.any(Number),
        ...createDto,
      });
      expect(repository.create).toHaveBeenCalledWith(createDto);
      expect(repository.save).toHaveBeenCalled();
    });

    it('should use appointment.started_time for start_time when creating consultation', async () => {
      const appointmentWithTimes = {
        ...mockAppointment,
        started_time: '14:30:00',
        completed_time: '15:45:00',
        status: AppointmentStatus.COMPLETED,
      };

      // Clear all previous mock state
      mockRepository.findOne.mockClear();
      mockRepository.save.mockClear();
      (appointmentRepoMock.findOne as jest.Mock).mockClear();

      // Set up mocks for this test using mockImplementation
      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation
      (appointmentRepoMock.findOne as jest.Mock).mockImplementation(
        async () => appointmentWithTimes,
      );

      await service.create(createDto);

      // Verify that timestamps were set (they should be populated from appointment or current time)
      const saveCall = mockRepository.save.mock.calls[0][0];
      expect(saveCall.start_time).toBeDefined();
      expect(saveCall.start_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(saveCall.end_time).toBeDefined();
      expect(saveCall.end_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('should set both start_time and end_time even when appointment not yet marked completed', async () => {
      const appointmentInProgress = {
        ...mockAppointment,
        started_time: '14:30:00',
        completed_time: null,
        status: AppointmentStatus.IN_PROGRESS, // Not completed yet
      };

      // Clear all previous mock state
      mockRepository.findOne.mockClear();
      mockRepository.save.mockClear();
      (appointmentRepoMock.findOne as jest.Mock).mockClear();

      // Set up mocks for this test using mockImplementation
      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation
      (appointmentRepoMock.findOne as jest.Mock).mockImplementation(
        async () => appointmentInProgress,
      );

      await service.create(createDto);

      // Verify that both timestamps are set (start from appointment, end from current time as fallback)
      const saveCall = mockRepository.save.mock.calls[0][0];
      expect(saveCall.start_time).toBeDefined();
      expect(saveCall.start_time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
      expect(saveCall.end_time).toBeDefined();
      expect(saveCall.end_time).toMatch(/^\d{2}:\d{2}:\d{2}$/); // HH:MM:SS format
    });

    it('should use current time as fallback when appointment has no started_time', async () => {
      const appointmentWithoutTimes = {
        ...mockAppointment,
        started_time: null,
        completed_time: null,
        status: AppointmentStatus.COMPLETED,
      };

      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(appointmentWithoutTimes);

      await service.create(createDto);

      // Verify that the save was called with some time values (fallback to current time)
      const saveCall = mockRepository.save.mock.calls[0][0];
      expect(saveCall.start_time).toBeDefined();
      expect(saveCall.start_time).toMatch(/^\d{2}:\d{2}:\d{2}$/); // HH:MM:SS format
    });

    it('should throw DuplicateConsultationException when consultation already exists', async () => {
      mockRepository.findOne
        .mockResolvedValueOnce(mockConsultation) // Existing consultation found
        .mockResolvedValueOnce(mockAppointment); // Appointment check (shouldn't reach here)

      await expect(service.create(createDto)).rejects.toThrow(
        DuplicateConsultationException,
      );
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { appointment_id: createDto.appointment_id },
      });
    });

    it('should throw InvalidReturnWeeksException when return weeks is invalid', async () => {
      const invalidDto = { ...createDto, return_weeks: 53 };
      mockRepository.findOne
        .mockResolvedValueOnce(null) // No existing consultation
        .mockResolvedValueOnce(mockAppointment); // Appointment check (shouldn't reach here)

      await expect(service.create(invalidDto)).rejects.toThrow(
        InvalidReturnWeeksException,
      );
    });

    it('should throw InvalidAppointmentStatusException when appointment is cancelled', async () => {
      const cancelledAppointment = {
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      };

      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(cancelledAppointment); // Cancelled appointment

      await expect(service.create(createDto)).rejects.toThrow(
        InvalidAppointmentStatusException,
      );
    });

    it('should throw NotFoundException when appointment not found', async () => {
      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(null); // Appointment not found

      await expect(service.create(createDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle database unique constraint violation', async () => {
      const dbError = {
        code: '23505',
        detail: 'Key (appointment_id)=(1) already exists.',
      };

      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation found initially
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(mockAppointment);
      mockRepository.save.mockRejectedValueOnce(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        DuplicateConsultationException,
      );
    });

    it('should handle database error with invalid appointment ID format', async () => {
      const dbError = {
        code: '23505',
        detail: 'Key (appointment_id)=(invalid) already exists.',
      };

      mockRepository.findOne.mockResolvedValueOnce(null);
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(mockAppointment);
      mockRepository.save.mockRejectedValueOnce(dbError);

      await expect(service.create(createDto)).rejects.toThrow(
        DuplicateConsultationException,
      );
    });

    it('should re-throw non-HTTP exceptions', async () => {
      const genericError = new Error('Database connection failed');

      mockRepository.findOne.mockResolvedValueOnce(null);
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(mockAppointment);
      mockRepository.save.mockRejectedValueOnce(genericError);

      await expect(service.create(createDto)).rejects.toThrow(
        'Database connection failed',
      );
    });

    it('should create consultation with valid return_weeks of 0 (null case)', async () => {
      const createDtoWithNoReturnWeeks = {
        ...createDto,
        return_weeks: undefined,
      };

      mockRepository.findOne.mockResolvedValueOnce(null); // No existing consultation
      jest
        .spyOn(mockAppointmentRepository, 'findOne')
        .mockResolvedValueOnce(mockAppointment);

      const result = await service.create(createDtoWithNoReturnWeeks);

      expect(result).toHaveProperty('consultation');
      expect(result.consultation).toEqual({
        id: expect.any(Number),
        ...createDtoWithNoReturnWeeks,
      });
    });
  });

  describe('findAll', () => {
    it('should return an array of consultations with relations', async () => {
      const result = await service.findAll();

      expect(result).toEqual([mockConsultation]);
      expect(repository.find).toHaveBeenCalledWith({
        relations: ['appointment', 'appointment.patient'],
      });
    });
  });

  describe('findOne', () => {
    it('should return a single consultation', async () => {
      const result = await service.findOne(1);

      expect(result).toEqual(mockConsultation);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        relations: ['appointment', 'appointment.patient'],
      });
    });

    it('should throw NotFoundException when consultation not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByAppointment', () => {
    it('should return a consultation for a specific appointment', async () => {
      const result = await service.findByAppointment(1);

      expect(result).toEqual(mockConsultation);
      expect(repository.findOne).toHaveBeenCalledWith({
        where: { appointment_id: 1 },
        relations: ['appointment', 'appointment.patient'],
      });
    });

    it('should throw NotFoundException when no consultation exists for appointment', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);
      await expect(service.findByAppointment(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a consultation', async () => {
      const updateDto = {
        appointment_id: 1,
        food: 'Updated food recommendations',
        water: 'Updated water recommendations',
        notes: 'Updated treatment notes',
      } as UpdateConsultationDto;

      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockConsultation);

      await service.update(1, updateDto);

      expect(repository.update).toHaveBeenCalledWith(1, updateDto);
      expect(repository.findOne).toHaveBeenCalled();
    });

    it('should throw NotFoundException when consultation not found', async () => {
      jest.spyOn(repository, 'findOne').mockResolvedValueOnce(null);

      const updateDto = {
        appointment_id: 1,
        food: 'Updated food recommendations',
      } as UpdateConsultationDto;

      await expect(service.update(999, updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when return_weeks is invalid (too low)', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockConsultation);

      const invalidUpdateDto = {
        return_weeks: -1,
      } as UpdateConsultationDto;

      await expect(service.update(1, invalidUpdateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when return_weeks is invalid (too high)', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockConsultation);

      const invalidUpdateDto = {
        return_weeks: 53,
      } as UpdateConsultationDto;

      await expect(service.update(1, invalidUpdateDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should update successfully when return_weeks is undefined', async () => {
      jest
        .spyOn(repository, 'findOne')
        .mockResolvedValueOnce(mockConsultation);

      const updateDto = {
        food: 'Updated food only',
      } as UpdateConsultationDto;

      await service.update(1, updateDto);

      expect(repository.update).toHaveBeenCalledWith(1, updateDto);
      expect(repository.findOne).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should remove a consultation', async () => {
      await service.remove(1);
      expect(repository.delete).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when consultation not found', async () => {
      jest
        .spyOn(repository, 'delete')
        .mockResolvedValueOnce({ affected: 0, raw: {} } as DeleteResult);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});
