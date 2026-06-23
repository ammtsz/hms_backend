import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationController } from '../consultation.controller';
import { ConsultationService } from '../../services/consultation.service';
import {
  CreateConsultationDto,
  UpdateConsultationDto,
} from '../../dtos/consultation.dto';
import { Consultation } from '../../entities/consultation.entity';
import { Attendance } from '../../entities/attendance.entity';
import { AttendanceType, AttendanceStatus } from '../../common/enums';
import {
  DuplicateConsultationException,
  InvalidAttendanceStatusException,
  InvalidReturnWeeksException,
} from '../../common/exceptions/consultation.exceptions';

describe('ConsultationController', () => {
  let controller: ConsultationController;
  let service: ConsultationService;

  const mockConsultationService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByAttendance: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockAttendance: Attendance = {
    id: 1,
    patient_id: 1,
    type: AttendanceType.ASSESSMENT,
    status: AttendanceStatus.SCHEDULED,
    scheduled_date: '2025-07-22',
    scheduled_time: '14:30',
    notes: 'Test notes',
    checked_in_time: null,
    started_time: null,
    completed_time: null,
    cancelled_date: null,
    cancelled_time: null,
    absence_justified: false,
    absence_notes: null,
    parent_attendance_id: null,
    rescheduled_from_attendance_id: null,
    timezone_override: null,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
    patient: null,
    consultation: null,
  };

  const mockConsultation: Consultation = {
    id: 1,
    attendance_id: 1,
    attendance: mockAttendance,
    main_concern: 'Test complaint',
    patient_status: null,
    food: 'Test food recommendations',
    water: 'Test water recommendations',
    ointments: 'Test ointments',
    physiotherapy: true,
    tens: false,
    return_weeks: 2,
    return_when_treatment_complete: false,
    notes: 'Test notes',
    start_time: '14:30:00',
    end_time: '15:00:00',
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConsultationController],
      providers: [
        {
          provide: ConsultationService,
          useValue: mockConsultationService,
        },
      ],
    }).compile();

    controller = module.get<ConsultationController>(
      ConsultationController,
    );
    service = module.get<ConsultationService>(ConsultationService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    const createDto: CreateConsultationDto = {
      attendance_id: 1,
      food: 'Test food recommendations',
      water: 'Test water recommendations',
      ointments: 'Test ointments',
      physiotherapy: true,
      tens: false,
      return_weeks: 2,
      notes: 'Test notes',
    };

    it('should create a consultation', async () => {
      jest
        .spyOn(service, 'create')
        .mockResolvedValue({ consultation: mockConsultation });

      const result = await controller.create(createDto);

      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toBeDefined();
      expect(result.consultation).toBeDefined();
      expect(result.consultation.id).toBe(mockConsultation.id);
      expect(result.consultation.attendance_id).toBe(
        mockConsultation.attendance_id,
      );
      expect(result.consultation.food).toBe(mockConsultation.food);
    });

    it('should handle DuplicateConsultationException', async () => {
      jest
        .spyOn(service, 'create')
        .mockRejectedValue(new DuplicateConsultationException(1, 1));

      await expect(controller.create(createDto)).rejects.toThrow(
        DuplicateConsultationException,
      );
    });

    it('should handle InvalidReturnWeeksException', async () => {
      const invalidDto = { ...createDto, return_weeks: 53 };
      jest
        .spyOn(service, 'create')
        .mockRejectedValue(new InvalidReturnWeeksException(53));

      await expect(controller.create(invalidDto)).rejects.toThrow(
        InvalidReturnWeeksException,
      );
    });

    it('should handle InvalidAttendanceStatusException', async () => {
      jest
        .spyOn(service, 'create')
        .mockRejectedValue(
          new InvalidAttendanceStatusException(1, 'cancelled'),
        );

      await expect(controller.create(createDto)).rejects.toThrow(
        InvalidAttendanceStatusException,
      );
    });

    it('should return cancelled_attendances when create triggers D/C transition', async () => {
      const cancelledAttendances = [
        { id: 2, patient_id: 1, scheduled_date: '2026-01-20', type: 'assessment' },
      ];
      jest.spyOn(service, 'create').mockResolvedValue({
        consultation: mockConsultation,
        cancelledAttendances,
      });

      const result = await controller.create(createDto);

      expect(result.consultation).toBeDefined();
      expect(result.cancelled_attendances).toEqual(cancelledAttendances);
    });
  });

  describe('findAll', () => {
    it('should return an array of consultations', async () => {
      const consultations = [mockConsultation];
      jest.spyOn(service, 'findAll').mockResolvedValue(consultations);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalled();
      expect(result).toEqual(consultations);
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(mockConsultation.id);
    });
  });

  describe('findByAttendance', () => {
    it('should return a consultation by attendance id', async () => {
      jest
        .spyOn(service, 'findByAttendance')
        .mockResolvedValue(mockConsultation);

      const result = await controller.findByAttendance('1');

      expect(service.findByAttendance).toHaveBeenCalledWith(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(mockConsultation.id);
      expect(result.attendance_id).toBe(1);
    });
  });

  describe('update', () => {
    const updateDto: UpdateConsultationDto = {
      attendance_id: 1,
      food: 'Updated food recommendations',
      water: 'Updated water recommendations',
      ointments: 'Updated ointments',
      physiotherapy: false,
      tens: true,
      return_weeks: 3,
      notes: 'Updated notes',
    };
    it('should update a consultation', async () => {
      const updatedConsultation = {
        ...mockConsultation,
        ...updateDto,
        id: 1,
      };
      jest
        .spyOn(service, 'update')
        .mockResolvedValue({ consultation: updatedConsultation });

      const result = await controller.update('1', updateDto);

      expect(service.update).toHaveBeenCalledWith(1, updateDto);
      expect(result).toBeDefined();
      expect(result.consultation).toBeDefined();
      expect(result.consultation.id).toBe(updatedConsultation.id);
      expect(result.consultation.food).toBe(updateDto.food);
      expect(result.consultation.water).toBe(updateDto.water);
      expect(result.consultation.ointments).toBe(updateDto.ointments);
    });

    it('should return cancelled_attendances when update triggers D/C transition', async () => {
      const updatedConsultation = {
        ...mockConsultation,
        patient_status: 'D',
      };
      const cancelledAttendances = [
        { id: 3, patient_id: 1, scheduled_date: '2026-01-22', type: 'assessment' },
      ];
      jest.spyOn(service, 'update').mockResolvedValue({
        consultation: updatedConsultation,
        cancelledAttendances,
      });

      const result = await controller.update('1', {
        ...updateDto,
        patient_status: 'D',
      });

      expect(result.consultation).toBeDefined();
      expect(result.cancelled_attendances).toEqual(cancelledAttendances);
    });
  });

  describe('remove', () => {
    it('should remove a consultation', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue(undefined);

      await controller.remove('1');

      expect(service.remove).toHaveBeenCalledWith(1);
    });

    it('should return void when successfully removed', async () => {
      jest.spyOn(service, 'remove').mockResolvedValue(undefined);

      const result = await controller.remove('1');

      expect(result).toBeUndefined();
    });
  });
});
