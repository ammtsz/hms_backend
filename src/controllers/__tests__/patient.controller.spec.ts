import { Test, TestingModule } from '@nestjs/testing';
import { PatientController } from '../patient.controller';
import { PatientService } from '../../services/patient.service';
import { CreatePatientDto, UpdatePatientDto } from '../../dtos/patient.dto';
import { PatientNoteService } from '../../services/patient-note.service';
import { PatientPriority, PatientStatus } from '../../common/enums';

describe('PatientController', () => {
  let controller: PatientController;
  let service: PatientService;

  const mockPatient = {
    id: 1,
    name: 'John Doe',
    phone: '(555) 123-4567',
    priority: PatientPriority.LEVEL_3,
    patient_status: PatientStatus.IN_TREATMENT,
    birth_date: '1990-01-01',
    main_concern: null,
    start_date: '2025-07-22',
    discharge_date: null,
    missing_appointments_streak: 0,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  };

  const mockPatientService = {
    create: jest.fn((dto) => Promise.resolve({ id: 1, ...dto })),
    findAll: jest.fn(() => Promise.resolve([mockPatient])),
    findOne: jest.fn(() => Promise.resolve(mockPatient)),
    update: jest.fn((id, dto) => Promise.resolve({ id, ...dto })),
    setPatientStatus: jest.fn((id, status) =>
      Promise.resolve({ patient: { ...mockPatient, patient_status: status } }),
    ),
    remove: jest.fn(() => Promise.resolve({ deleted: true })),
  };

  const mockPatientNoteService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PatientController],
      providers: [
        {
          provide: PatientService,
          useValue: mockPatientService,
        },
        {
          provide: PatientNoteService,
          useValue: mockPatientNoteService,
        },
      ],
    }).compile();

    controller = module.get<PatientController>(PatientController);
    service = module.get<PatientService>(PatientService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new patient', async () => {
      const createDto: CreatePatientDto = {
        name: 'John Doe',
        phone: '(555) 123-4567',
        priority: PatientPriority.LEVEL_3,
      };

      const result = await controller.create(createDto);

      expect(result).toEqual({
        id: expect.any(Number),
        ...createDto,
      });
      expect(service.create).toHaveBeenCalledWith(createDto);
    });
  });

  describe('findAll', () => {
    it('should return an array of patients', async () => {
      const result = await controller.findAll();

      expect(result).toEqual([mockPatient]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single patient', async () => {
      const result = await controller.findOne('1');

      expect(result).toEqual(mockPatient);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });
  });

  describe('update', () => {
    it('should update a patient', async () => {
      const updateDto: UpdatePatientDto = {
        name: 'John Doe Updated',
        phone: '(555) 123-4567',
        priority: PatientPriority.LEVEL_3,
      };

      const result = await controller.update('1', updateDto);

      expect(result).toEqual({
        id: 1,
        ...updateDto,
      });
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
      expect(service.setPatientStatus).not.toHaveBeenCalled();
    });

    it('should call setPatientStatus and return patient when patient_status is DISCHARGED', async () => {
      const updateDto: UpdatePatientDto = {
        patient_status: PatientStatus.DISCHARGED,
      };
      const dischargedPatient = {
        ...mockPatient,
        patient_status: PatientStatus.DISCHARGED,
      };
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: dischargedPatient,
      });

      const result = await controller.update('1', updateDto);

      expect(result).toEqual(dischargedPatient);
      expect(service.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.DISCHARGED,
        undefined,
      );
      expect(service.update).not.toHaveBeenCalled();
    });

    it('should call setPatientStatus and return patient when patient_status is CONSECUTIVE_NO_SHOWS', async () => {
      const updateDto: UpdatePatientDto = {
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      const absentPatient = {
        ...mockPatient,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: absentPatient,
      });

      const result = await controller.update('1', updateDto);

      expect(result).toEqual(absentPatient);
      expect(service.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        undefined,
      );
      expect(service.update).not.toHaveBeenCalled();
    });

    it('should pass cancellation_reason to setPatientStatus options', async () => {
      const updateDto: UpdatePatientDto = {
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
        cancellation_reason: 'Patient requested cancellation',
      };
      const absentPatient = {
        ...mockPatient,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: absentPatient,
      });

      const result = await controller.update('1', updateDto);

      expect(result).toEqual(absentPatient);
      expect(service.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        { cancellationReason: 'Patient requested cancellation' },
      );
      expect(service.update).not.toHaveBeenCalled();
    });

    it('should call setPatientStatus then update with other fields when patient_status is DISCHARGED and other fields provided', async () => {
      const updateDto: UpdatePatientDto = {
        patient_status: PatientStatus.DISCHARGED,
        name: 'John Doe Updated',
        discharge_date: '2026-03-15',
      };
      const dischargedPatient = {
        ...mockPatient,
        patient_status: PatientStatus.DISCHARGED,
      };
      const updatedPatient = {
        ...dischargedPatient,
        name: 'John Doe Updated',
        discharge_date: '2026-03-15',
      };
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: dischargedPatient,
      });
      mockPatientService.update.mockResolvedValueOnce(updatedPatient);

      const result = await controller.update('1', updateDto);

      expect(service.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.DISCHARGED,
        undefined,
      );
      expect(service.update).toHaveBeenCalledWith(1, {
        name: 'John Doe Updated',
        discharge_date: '2026-03-15',
      });
      expect(result).toEqual(updatedPatient);
    });

    it('should call setPatientStatus then update with other fields when patient_status is CONSECUTIVE_NO_SHOWS and other fields provided', async () => {
      const updateDto: UpdatePatientDto = {
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
        phone: '(555) 987-6543',
      };
      const absentPatient = {
        ...mockPatient,
        patient_status: PatientStatus.CONSECUTIVE_NO_SHOWS,
      };
      const updatedPatient = {
        ...absentPatient,
        phone: '(555) 987-6543',
      };
      mockPatientService.setPatientStatus.mockResolvedValueOnce({
        patient: absentPatient,
      });
      mockPatientService.update.mockResolvedValueOnce(updatedPatient);

      const result = await controller.update('1', updateDto);

      expect(service.setPatientStatus).toHaveBeenCalledWith(
        1,
        PatientStatus.CONSECUTIVE_NO_SHOWS,
        undefined,
      );
      expect(service.update).toHaveBeenCalledWith(1, { phone: '(555) 987-6543' });
      expect(result).toEqual(updatedPatient);
    });
  });

  describe('remove', () => {
    it('should remove a patient', async () => {
      const result = await controller.remove('1');

      expect(result).toEqual(undefined);
      expect(service.remove).toHaveBeenCalledWith(1);
    });
  });
});
