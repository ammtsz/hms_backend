import { Test, TestingModule } from '@nestjs/testing';
import { ConsultationController } from '../consultation.controller';
import { ConsultationService } from '../../services/consultation.service';
import {
  CreateConsultationDto,
  UpdateConsultationDto,
} from '../../dtos/consultation.dto';
import { Consultation } from '../../entities/consultation.entity';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentType, AppointmentStatus } from '../../common/enums';
import {
  DuplicateConsultationException,
  InvalidAppointmentStatusException,
  InvalidReturnWeeksException,
} from '../../common/exceptions/consultation.exceptions';

describe('ConsultationController', () => {
  let controller: ConsultationController;
  let service: ConsultationService;

  const mockConsultationService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByAppointment: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockAppointment: Appointment = {
    id: 1,
    patient_id: 1,
    type: AppointmentType.ASSESSMENT,
    status: AppointmentStatus.SCHEDULED,
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
    parent_appointment_id: null,
    rescheduled_from_appointment_id: null,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
    patient: null,
    consultation: null,
  };

  const mockConsultation: Consultation = {
    id: 1,
    appointment_id: 1,
    appointment: mockAppointment,
    main_concern: 'Test complaint',
    patient_status: null,
    home_exercises: 'Test home exercises',
    pain_management: 'Test pain management',
    medications: 'Test medications',
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
      appointment_id: 1,
      home_exercises: 'Test home exercises',
      pain_management: 'Test pain management',
      medications: 'Test medications',
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
      expect(result.consultation.appointment_id).toBe(
        mockConsultation.appointment_id,
      );
      expect(result.consultation.home_exercises).toBe(mockConsultation.home_exercises);
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

    it('should handle InvalidAppointmentStatusException', async () => {
      jest
        .spyOn(service, 'create')
        .mockRejectedValue(
          new InvalidAppointmentStatusException(1, 'cancelled'),
        );

      await expect(controller.create(createDto)).rejects.toThrow(
        InvalidAppointmentStatusException,
      );
    });

    it('should return cancelled_appointments when create triggers D/C transition', async () => {
      const cancelledAppointments = [
        { id: 2, patient_id: 1, scheduled_date: '2026-01-20', type: 'assessment' },
      ];
      jest.spyOn(service, 'create').mockResolvedValue({
        consultation: mockConsultation,
        cancelledAppointments,
      });

      const result = await controller.create(createDto);

      expect(result.consultation).toBeDefined();
      expect(result.cancelled_appointments).toEqual(cancelledAppointments);
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

  describe('findByAppointment', () => {
    it('should return a consultation by appointment id', async () => {
      jest
        .spyOn(service, 'findByAppointment')
        .mockResolvedValue(mockConsultation);

      const result = await controller.findByAppointment('1');

      expect(service.findByAppointment).toHaveBeenCalledWith(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(mockConsultation.id);
      expect(result.appointment_id).toBe(1);
    });
  });

  describe('update', () => {
    const updateDto: UpdateConsultationDto = {
      appointment_id: 1,
      home_exercises: 'Updated home exercises',
      pain_management: 'Updated pain management',
      medications: 'Updated medications',
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
      expect(result.consultation.home_exercises).toBe(updateDto.home_exercises);
      expect(result.consultation.pain_management).toBe(updateDto.pain_management);
      expect(result.consultation.medications).toBe(updateDto.medications);
    });

    it('should return cancelled_appointments when update triggers D/C transition', async () => {
      const updatedConsultation = {
        ...mockConsultation,
        patient_status: 'D',
      };
      const cancelledAppointments = [
        { id: 3, patient_id: 1, scheduled_date: '2026-01-22', type: 'assessment' },
      ];
      jest.spyOn(service, 'update').mockResolvedValue({
        consultation: updatedConsultation,
        cancelledAppointments,
      });

      const result = await controller.update('1', {
        ...updateDto,
        patient_status: 'D',
      });

      expect(result.consultation).toBeDefined();
      expect(result.cancelled_appointments).toEqual(cancelledAppointments);
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
