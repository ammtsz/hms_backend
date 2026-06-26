import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TreatmentService } from '../services/treatment.service';
import { AppointmentService } from '../services/appointment.service';
import { Treatment, TreatmentType } from '../entities/treatment.entity';
import { Session } from '../entities/session.entity';
import { Consultation } from '../entities/consultation.entity';
import { Appointment } from '../entities/appointment.entity';
import { Patient } from '../entities/patient.entity';
import { AppointmentType, AppointmentStatus } from '../common/enums';

describe('TreatmentService - Appointment Creation', () => {
  let service: TreatmentService;

  const mockTreatmentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockSessionRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockConsultationRepository = {
    findOne: jest.fn(),
  };

  const mockAppointmentRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockPatientRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockAppointmentService = {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn(),
    checkHolidayAndPostpone: jest.fn((date, _type) => Promise.resolve(date)),
    findNextSchedulableDate: jest.fn((date: string) => Promise.resolve(date)),
    assertNoTreatmentSchedulingConflict: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TreatmentService,
        {
          provide: getRepositoryToken(Treatment),
          useValue: mockTreatmentRepository,
        },
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepository,
        },
        {
          provide: getRepositoryToken(Consultation),
          useValue: mockConsultationRepository,
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: mockAppointmentRepository,
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: mockPatientRepository,
        },
        {
          provide: AppointmentService,
          useValue: mockAppointmentService,
        },
      ],
    }).compile();

    service = module.get<TreatmentService>(TreatmentService);
  });

  describe('createTreatment with automatic appointment creation', () => {
    it('should create multiple appointments for multiple sessions', async () => {
      // Setup
      const consultationId = 1;
      const appointmentId = 1;
      const patientId = 1;
      const startDate = '2024-01-15'; // Monday in YYYY-MM-DD format
      const plannedSessions = 4;

      const mockConsultation = { id: consultationId };
      const mockAppointment = { id: appointmentId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 45,
      };

      // Mock repository responses
      mockConsultationRepository.findOne.mockResolvedValue(mockConsultation);
      mockAppointmentRepository.findOne.mockResolvedValue(mockAppointment);
      mockTreatmentRepository.create.mockReturnValue(mockTreatment);
      mockTreatmentRepository.save.mockResolvedValue(mockTreatment);
      mockTreatmentRepository.findOne.mockResolvedValue(mockTreatment);

      // Mock session creation
      const mockSessions = Array.from({ length: plannedSessions }, (_, i) => ({
        id: i + 1,
        treatment_id: 1,
        session_number: i + 1,
        scheduled_date: startDate, // Will be calculated correctly in actual code
        status: 'scheduled',
      }));
      mockSessionRepository.create.mockImplementation((data) => data);
      mockSessionRepository.save.mockResolvedValue(mockSessions);

      // Mock appointment creation
      const mockCreatedAppointment = { id: 2 };
      mockAppointmentRepository.create.mockImplementation((data) => data);
      mockAppointmentRepository.save.mockResolvedValue(mockCreatedAppointment);

      // Call the service
      const result = await service.createTreatment({
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 45,
      });

      // Verify treatment session was created
      expect(mockTreatmentRepository.create).toHaveBeenCalled();
      expect(mockTreatmentRepository.save).toHaveBeenCalled();

      // Verify sessions were created (4 times for 4 planned sessions)
      expect(mockSessionRepository.save).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ session_number: 1 }),
          expect.objectContaining({ session_number: 2 }),
          expect.objectContaining({ session_number: 3 }),
          expect.objectContaining({ session_number: 4 }),
        ]),
      );

      // Verify appointments were created for each session
      expect(mockAppointmentRepository.save).toHaveBeenCalledTimes(
        plannedSessions,
      );

      // Verify result
      expect(result.id).toBe(1);
      expect(result.planned_sessions).toBe(plannedSessions);
    });

    it('should create appointments with correct type based on treatment type', async () => {
      // Setup for TENS treatment
      const consultationId = 1;
      const appointmentId = 1;
      const patientId = 1;
      const startDate = '2024-01-15';
      const plannedSessions = 3;

      const mockConsultation = { id: consultationId };
      const mockAppointment = { id: appointmentId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.TENS,
        body_location: 'Back',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 30,
      };

      // Mock repository responses
      mockConsultationRepository.findOne.mockResolvedValue(mockConsultation);
      mockAppointmentRepository.findOne.mockResolvedValue(mockAppointment);
      mockTreatmentRepository.create.mockReturnValue(mockTreatment);
      mockTreatmentRepository.save.mockResolvedValue(mockTreatment);
      mockTreatmentRepository.findOne.mockResolvedValue(mockTreatment);

      // Mock session creation
      const mockSessions = Array.from({ length: plannedSessions }, (_, i) => ({
        id: i + 1,
        treatment_id: 1,
        session_number: i + 1,
        scheduled_date: startDate,
        status: 'scheduled',
      }));
      mockSessionRepository.create.mockImplementation((data) => data);
      mockSessionRepository.save.mockResolvedValue(mockSessions);

      // Mock appointment creation - capture the calls
      const createdAppointments = [];
      mockAppointmentRepository.create.mockImplementation((data) => {
        createdAppointments.push(data);
        return data;
      });
      mockAppointmentRepository.save.mockResolvedValue({ id: 2 });

      // Call the service
      await service.createTreatment({
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.TENS,
        body_location: 'Back',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 30,
      });

      // Verify appointments were created with TENS type
      expect(createdAppointments.length).toBe(plannedSessions);
      createdAppointments.forEach((appointment) => {
        expect(appointment.type).toBe(AppointmentType.TENS);
        expect(appointment.patient_id).toBe(patientId);
        expect(appointment.status).toBe(AppointmentStatus.SCHEDULED);
        expect(appointment.parent_appointment_id).toBe(appointmentId);
      });
    });

    it('should schedule sessions weekly with 7-day intervals', async () => {
      // Setup
      const consultationId = 1;
      const appointmentId = 1;
      const patientId = 1;
      const startDate = '2024-01-15'; // Monday
      const plannedSessions = 3;

      const mockConsultation = { id: consultationId };
      const mockAppointment = { id: appointmentId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 45,
      };

      // Mock repository responses
      mockConsultationRepository.findOne.mockResolvedValue(mockConsultation);
      mockAppointmentRepository.findOne.mockResolvedValue(mockAppointment);
      mockTreatmentRepository.create.mockReturnValue(mockTreatment);
      mockTreatmentRepository.save.mockResolvedValue(mockTreatment);
      mockTreatmentRepository.findOne.mockResolvedValue(mockTreatment);

      // Capture sessions as they are created
      const createdSessions = [];
      mockSessionRepository.create.mockImplementation((data) => {
        createdSessions.push(data);
        return data;
      });
      mockSessionRepository.save.mockImplementation((sessionRows) => {
        return Promise.resolve(sessionRows);
      });

      mockAppointmentRepository.create.mockImplementation((data) => data);
      mockAppointmentRepository.save.mockResolvedValue({ id: 2 });

      // Call the service
      await service.createTreatment({
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 45,
      });

      // Verify sessions were created with weekly intervals
      expect(createdSessions.length).toBe(plannedSessions);

      // First session should start on the start_date
      expect(createdSessions[0].scheduled_date).toBe('2024-01-15');

      // Second session should be 7 days later
      expect(createdSessions[1].scheduled_date).toBe('2024-01-22');

      // Third session should be another 7 days later
      expect(createdSessions[2].scheduled_date).toBe('2024-01-29');
    });

    it('should use 19:30 as default time for all treatment sessions', async () => {
      const consultationId = 1;
      const appointmentId = 1;
      const patientId = 1;
      const startDate = '2024-01-15';
      const plannedSessions = 2;

      const mockConsultation = { id: consultationId };
      const mockAppointment = { id: appointmentId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 45,
      };

      mockConsultationRepository.findOne.mockResolvedValue(mockConsultation);
      mockAppointmentRepository.findOne.mockResolvedValue(mockAppointment);
      mockTreatmentRepository.create.mockReturnValue(mockTreatment);
      mockTreatmentRepository.save.mockResolvedValue(mockTreatment);
      mockTreatmentRepository.findOne.mockResolvedValue(mockTreatment);

      const mockSessions = Array.from({ length: plannedSessions }, (_, i) => ({
        id: i + 1,
        treatment_id: 1,
        session_number: i + 1,
        scheduled_date: startDate,
        status: 'scheduled',
      }));
      mockSessionRepository.create.mockImplementation((data) => data);
      mockSessionRepository.save.mockResolvedValue(mockSessions);

      const createdAppointments = [];
      mockAppointmentRepository.create.mockImplementation((data) => {
        createdAppointments.push(data);
        return data;
      });
      mockAppointmentRepository.save.mockResolvedValue({ id: 2 });

      await service.createTreatment({
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 45,
      });

      // Verify all appointments use 19:30 time
      createdAppointments.forEach((appointment) => {
        expect(appointment.scheduled_time).toBe('19:30');
      });
    });

    it('should link all treatment appointments to parent consultation', async () => {
      const consultationId = 1;
      const appointmentId = 999; // The original assessment consultation
      const patientId = 1;
      const startDate = '2024-01-15';
      const plannedSessions = 3;

      const mockConsultation = { id: consultationId };
      const mockAppointment = { id: appointmentId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 45,
      };

      mockConsultationRepository.findOne.mockResolvedValue(mockConsultation);
      mockAppointmentRepository.findOne.mockResolvedValue(mockAppointment);
      mockTreatmentRepository.create.mockReturnValue(mockTreatment);
      mockTreatmentRepository.save.mockResolvedValue(mockTreatment);
      mockTreatmentRepository.findOne.mockResolvedValue(mockTreatment);

      const mockSessions = Array.from({ length: plannedSessions }, (_, i) => ({
        id: i + 1,
        treatment_id: 1,
        session_number: i + 1,
        scheduled_date: startDate,
        status: 'scheduled',
      }));
      mockSessionRepository.create.mockImplementation((data) => data);
      mockSessionRepository.save.mockResolvedValue(mockSessions);

      const createdAppointments = [];
      mockAppointmentRepository.create.mockImplementation((data) => {
        createdAppointments.push(data);
        return data;
      });
      mockAppointmentRepository.save.mockResolvedValue({ id: 2 });

      await service.createTreatment({
        consultation_id: consultationId,
        appointment_id: appointmentId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Head',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 45,
      });

      // Verify all treatment appointments link to the original consultation
      createdAppointments.forEach((appointment) => {
        expect(appointment.parent_appointment_id).toBe(appointmentId);
      });
    });
  });
});
