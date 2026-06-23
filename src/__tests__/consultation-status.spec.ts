import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConsultationService } from '../services/consultation.service';
import { Consultation } from '../entities/consultation.entity';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentService } from '../services/treatment.service';
import { AttendanceService } from '../services/attendance.service';
import { PatientService } from '../services/patient.service';
import { PatientStatus } from '../common/enums';
import { CreateConsultationDto } from '../dtos/consultation.dto';

describe('Consultation - patient_status field', () => {
  let service: ConsultationService;
  let consultationRepository: Repository<Consultation>;
  let attendanceRepository: Repository<Attendance>;
  let patientRepository: Repository<Patient>;

  const mockTreatmentService: Partial<TreatmentService> = {};

  const mockAttendanceService = {
    create: jest.fn(),
    findOne: jest.fn(),
  };

  const mockPatientService = {
    setPatientStatus: jest.fn().mockResolvedValue({
      patient: { id: 1, patient_status: 'D' },
      cancelledAttendances: [],
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConsultationService,
        {
          provide: getRepositoryToken(Consultation),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Attendance),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: 1,
              patient_status: 'N',
              main_concern: null,
            }),
            update: jest.fn(),
          },
        },
        {
          provide: TreatmentService,
          useValue: mockTreatmentService,
        },
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
        {
          provide: PatientService,
          useValue: mockPatientService,
        },
      ],
    }).compile();

    service = module.get<ConsultationService>(ConsultationService);
    consultationRepository = module.get<Repository<Consultation>>(
      getRepositoryToken(Consultation),
    );
    attendanceRepository = module.get<Repository<Attendance>>(
      getRepositoryToken(Attendance),
    );
    patientRepository = module.get<Repository<Patient>>(
      getRepositoryToken(Patient),
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create consultation with patient_status', () => {
    it('should store patient_status in the consultation', async () => {
      const mockAttendance = {
        id: 1,
        patient_id: 1,
        type: 'assessment',
        status: 'in_progress',
        started_time: '10:00:00',
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: 'N',
        },
      } as Attendance;

      const createDto: CreateConsultationDto = {
        attendance_id: 1,
        main_concern: 'Back pain',
        patient_status: 'T',
        return_weeks: 2,
      };

      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(attendanceRepository, 'findOne')
        .mockResolvedValue(mockAttendance);

      const mockCreatedConsultation = {
        id: 1,
        ...createDto,
        start_time: '10:00:00',
        end_time: '11:00:00',
      } as Consultation;

      jest
        .spyOn(consultationRepository, 'create')
        .mockReturnValue(mockCreatedConsultation);
      jest
        .spyOn(consultationRepository, 'save')
        .mockResolvedValue(mockCreatedConsultation);
      jest.spyOn(mockAttendanceService, 'create').mockResolvedValue({} as any);

      const result = await service.create(createDto);

      // Verify that the consultation was created with patient_status
      expect(consultationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          attendance_id: 1,
          main_concern: 'Back pain',
          patient_status: 'T',
          return_weeks: 2,
        }),
      );

      // Verify the result includes patient_status
      expect(result.consultation).toMatchObject({
        id: 1,
        patient_status: 'T',
        main_concern: 'Back pain',
      });

      // Verify patient's patient_status was updated via setPatientStatus (single entry point)
      expect(mockPatientService.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.IN_TREATMENT,
        { excludeAttendanceIds: [1] },
      );
    });

    it('should store patient_status "N" for new patients', async () => {
      const mockAttendance = {
        id: 1,
        patient_id: 1,
        type: 'assessment',
        status: 'in_progress',
        started_time: '10:00:00',
        patient: {
          id: 1,
          name: 'New Patient',
          patient_status: 'N',
        },
      } as Attendance;

      const createDto: CreateConsultationDto = {
        attendance_id: 1,
        main_concern: 'First consultation',
        patient_status: 'N',
        return_weeks: 1,
      };

      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(attendanceRepository, 'findOne')
        .mockResolvedValue(mockAttendance);

      const mockCreatedConsultation = {
        id: 1,
        ...createDto,
        start_time: '10:00:00',
        end_time: '11:00:00',
      } as Consultation;

      jest
        .spyOn(consultationRepository, 'create')
        .mockReturnValue(mockCreatedConsultation);
      jest
        .spyOn(consultationRepository, 'save')
        .mockResolvedValue(mockCreatedConsultation);
      jest.spyOn(mockAttendanceService, 'create').mockResolvedValue({} as any);

      const result = await service.create(createDto);

      expect(result.consultation.patient_status).toBe('N');
    });

    it('should store patient_status "D" for discharged patients', async () => {
      const mockAttendance = {
        id: 1,
        patient_id: 1,
        type: 'assessment',
        status: 'in_progress',
        started_time: '10:00:00',
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: 'T',
        },
      } as Attendance;

      const createDto: CreateConsultationDto = {
        attendance_id: 1,
        main_concern: 'Final consultation',
        patient_status: 'D',
      };

      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(attendanceRepository, 'findOne')
        .mockResolvedValue(mockAttendance);

      const mockCreatedConsultation = {
        id: 1,
        ...createDto,
        start_time: '10:00:00',
        end_time: '11:00:00',
      } as Consultation;

      jest
        .spyOn(consultationRepository, 'create')
        .mockReturnValue(mockCreatedConsultation);
      jest
        .spyOn(consultationRepository, 'save')
        .mockResolvedValue(mockCreatedConsultation);

      const result = await service.create(createDto);

      expect(result.consultation.patient_status).toBe('D');
      expect(result.cancelledAttendances).toBeDefined();

      // When status is D, setPatientStatus is used (cancels open attendances)
      expect(mockPatientService.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.DISCHARGED,
        { excludeAttendanceIds: [1] },
      );
    });

    it('should handle null patient_status', async () => {
      const mockAttendance = {
        id: 1,
        patient_id: 1,
        type: 'assessment',
        status: 'in_progress',
        started_time: '10:00:00',
        patient: {
          id: 1,
          name: 'Test Patient',
          patient_status: 'T',
        },
      } as Attendance;

      const createDto: CreateConsultationDto = {
        attendance_id: 1,
        main_concern: 'Back pain',
        return_weeks: 2,
        // patient_status is optional/undefined
      };

      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(attendanceRepository, 'findOne')
        .mockResolvedValue(mockAttendance);

      const mockCreatedConsultation = {
        id: 1,
        ...createDto,
        start_time: '10:00:00',
        end_time: '11:00:00',
      } as Consultation;

      jest
        .spyOn(consultationRepository, 'create')
        .mockReturnValue(mockCreatedConsultation);
      jest
        .spyOn(consultationRepository, 'save')
        .mockResolvedValue(mockCreatedConsultation);
      jest.spyOn(mockAttendanceService, 'create').mockResolvedValue({} as any);

      const result = await service.create(createDto);

      // Should work fine with null/undefined patient_status
      expect(result).toBeDefined();
      expect(result.consultation).toBeDefined();
      expect(result.consultation.id).toBe(1);
    });
  });

  describe('update consultation with patient_status', () => {
    it('should update patient_status in the consultation', async () => {
      const mockExistingConsultation = {
        id: 1,
        attendance_id: 1,
        main_concern: 'Back pain',
        patient_status: 'N',
        attendance: {
          patient_id: 1,
          patient: {
            id: 1,
            patient_status: 'N',
          },
        },
      } as Consultation;

      const updateDto = {
        patient_status: 'T',
      };

      jest.spyOn(consultationRepository, 'update').mockResolvedValue({} as any);
      jest.spyOn(consultationRepository, 'findOne').mockResolvedValue({
        ...mockExistingConsultation,
        patient_status: 'T',
      } as Consultation);
      jest.spyOn(attendanceRepository, 'findOne').mockResolvedValue({
        id: 1,
        patient_id: 1,
        patient: {
          id: 1,
          patient_status: 'N',
        },
      } as Attendance);

      await service.update(1, updateDto);

      // Verify that the consultation was updated with patient_status
      expect(consultationRepository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          patient_status: 'T',
        }),
      );

      // Verify patient status was updated via setPatientStatus (single entry point)
      expect(mockPatientService.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.IN_TREATMENT,
        { excludeAttendanceIds: [1] },
      );
    });
  });
});
