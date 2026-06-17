import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TreatmentService } from '../services/treatment.service';
import { AttendanceService } from '../services/attendance.service';
import {
  Treatment,
  TreatmentType,
} from '../entities/treatment.entity';
import { Session } from '../entities/session.entity';
import { Consultation } from '../entities/consultation.entity';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { AttendanceType, AttendanceStatus } from '../common/enums';

describe('TreatmentService - Attendance Creation', () => {
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

  const mockAttendanceRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
  };

  const mockPatientRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockAttendanceService = {
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
          provide: getRepositoryToken(Attendance),
          useValue: mockAttendanceRepository,
        },
        {
          provide: getRepositoryToken(Patient),
          useValue: mockPatientRepository,
        },
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
        },
      ],
    }).compile();

    service = module.get<TreatmentService>(TreatmentService);
  });

  describe('createTreatment with automatic attendance creation', () => {
    it('should create multiple attendances for multiple sessions', async () => {
      // Setup
      const consultationId = 1;
      const attendanceId = 1;
      const patientId = 1;
      const startDate = '2024-01-15'; // Monday in YYYY-MM-DD format
      const plannedSessions = 4;

      const mockConsultation = { id: consultationId };
      const mockAttendance = { id: attendanceId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 30,
        color: 'azul',
      };

      // Mock repository responses
      mockConsultationRepository.findOne.mockResolvedValue(
        mockConsultation,
      );
      mockAttendanceRepository.findOne.mockResolvedValue(mockAttendance);
      mockTreatmentRepository.create.mockReturnValue(
        mockTreatment,
      );
      mockTreatmentRepository.save.mockResolvedValue(
        mockTreatment,
      );
      mockTreatmentRepository.findOne.mockResolvedValue(
        mockTreatment,
      );

      // Mock session creation
      const mockSessions = Array.from(
        { length: plannedSessions },
        (_, i) => ({
          id: i + 1,
          treatment_id: 1,
          session_number: i + 1,
          scheduled_date: startDate, // Will be calculated correctly in actual code
          status: 'scheduled',
        }),
      );
      mockSessionRepository.create.mockImplementation(
        (data) => data,
      );
      mockSessionRepository.save.mockResolvedValue(
        mockSessions,
      );

      // Mock attendance creation
      const mockCreatedAttendance = { id: 2 };
      mockAttendanceRepository.create.mockImplementation((data) => data);
      mockAttendanceRepository.save.mockResolvedValue(mockCreatedAttendance);

      // Call the service
      const result = await service.createTreatment({
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 30,
        color: 'azul',
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

      // Verify attendances were created for each session
      expect(mockAttendanceRepository.save).toHaveBeenCalledTimes(
        plannedSessions,
      );

      // Verify result
      expect(result.id).toBe(1);
      expect(result.planned_sessions).toBe(plannedSessions);
    });

    it('should create attendances with correct type based on treatment type', async () => {
      // Setup for TENS treatment
      const consultationId = 1;
      const attendanceId = 1;
      const patientId = 1;
      const startDate = '2024-01-15';
      const plannedSessions = 3;

      const mockConsultation = { id: consultationId };
      const mockAttendance = { id: attendanceId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.TENS,
        body_location: 'Coluna',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
      };

      // Mock repository responses
      mockConsultationRepository.findOne.mockResolvedValue(
        mockConsultation,
      );
      mockAttendanceRepository.findOne.mockResolvedValue(mockAttendance);
      mockTreatmentRepository.create.mockReturnValue(
        mockTreatment,
      );
      mockTreatmentRepository.save.mockResolvedValue(
        mockTreatment,
      );
      mockTreatmentRepository.findOne.mockResolvedValue(
        mockTreatment,
      );

      // Mock session creation
      const mockSessions = Array.from(
        { length: plannedSessions },
        (_, i) => ({
          id: i + 1,
          treatment_id: 1,
          session_number: i + 1,
          scheduled_date: startDate,
          status: 'scheduled',
        }),
      );
      mockSessionRepository.create.mockImplementation(
        (data) => data,
      );
      mockSessionRepository.save.mockResolvedValue(
        mockSessions,
      );

      // Mock attendance creation - capture the calls
      const createdAttendances = [];
      mockAttendanceRepository.create.mockImplementation((data) => {
        createdAttendances.push(data);
        return data;
      });
      mockAttendanceRepository.save.mockResolvedValue({ id: 2 });

      // Call the service
      await service.createTreatment({
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.TENS,
        body_location: 'Coluna',
        start_date: startDate,
        planned_sessions: plannedSessions,
      });

      // Verify attendances were created with TENS type
      expect(createdAttendances.length).toBe(plannedSessions);
      createdAttendances.forEach((attendance) => {
        expect(attendance.type).toBe(AttendanceType.TENS);
        expect(attendance.patient_id).toBe(patientId);
        expect(attendance.status).toBe(AttendanceStatus.SCHEDULED);
        expect(attendance.parent_attendance_id).toBe(attendanceId);
      });
    });

    it('should schedule sessions weekly with 7-day intervals', async () => {
      // Setup
      const consultationId = 1;
      const attendanceId = 1;
      const patientId = 1;
      const startDate = '2024-01-15'; // Monday
      const plannedSessions = 3;

      const mockConsultation = { id: consultationId };
      const mockAttendance = { id: attendanceId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 30,
        color: 'azul',
      };

      // Mock repository responses
      mockConsultationRepository.findOne.mockResolvedValue(
        mockConsultation,
      );
      mockAttendanceRepository.findOne.mockResolvedValue(mockAttendance);
      mockTreatmentRepository.create.mockReturnValue(
        mockTreatment,
      );
      mockTreatmentRepository.save.mockResolvedValue(
        mockTreatment,
      );
      mockTreatmentRepository.findOne.mockResolvedValue(
        mockTreatment,
      );

      // Capture sessions as they are created
      const createdSessions = [];
      mockSessionRepository.create.mockImplementation((data) => {
        createdSessions.push(data);
        return data;
      });
      mockSessionRepository.save.mockImplementation(
        (sessionRows) => {
          return Promise.resolve(sessionRows);
        },
      );

      mockAttendanceRepository.create.mockImplementation((data) => data);
      mockAttendanceRepository.save.mockResolvedValue({ id: 2 });

      // Call the service
      await service.createTreatment({
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 30,
        color: 'azul',
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
      const attendanceId = 1;
      const patientId = 1;
      const startDate = '2024-01-15';
      const plannedSessions = 2;

      const mockConsultation = { id: consultationId };
      const mockAttendance = { id: attendanceId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 30,
        color: 'azul',
      };

      mockConsultationRepository.findOne.mockResolvedValue(
        mockConsultation,
      );
      mockAttendanceRepository.findOne.mockResolvedValue(mockAttendance);
      mockTreatmentRepository.create.mockReturnValue(
        mockTreatment,
      );
      mockTreatmentRepository.save.mockResolvedValue(
        mockTreatment,
      );
      mockTreatmentRepository.findOne.mockResolvedValue(
        mockTreatment,
      );

      const mockSessions = Array.from(
        { length: plannedSessions },
        (_, i) => ({
          id: i + 1,
          treatment_id: 1,
          session_number: i + 1,
          scheduled_date: startDate,
          status: 'scheduled',
        }),
      );
      mockSessionRepository.create.mockImplementation(
        (data) => data,
      );
      mockSessionRepository.save.mockResolvedValue(
        mockSessions,
      );

      const createdAttendances = [];
      mockAttendanceRepository.create.mockImplementation((data) => {
        createdAttendances.push(data);
        return data;
      });
      mockAttendanceRepository.save.mockResolvedValue({ id: 2 });

      await service.createTreatment({
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 30,
        color: 'azul',
      });

      // Verify all attendances use 19:30 time
      createdAttendances.forEach((attendance) => {
        expect(attendance.scheduled_time).toBe('19:30');
      });
    });

    it('should link all treatment attendances to parent consultation', async () => {
      const consultationId = 1;
      const attendanceId = 999; // The original assessment consultation
      const patientId = 1;
      const startDate = '2024-01-15';
      const plannedSessions = 3;

      const mockConsultation = { id: consultationId };
      const mockAttendance = { id: attendanceId };
      const mockTreatment = {
        id: 1,
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        completed_sessions: 0,
        status: 'scheduled',
        duration_minutes: 30,
        color: 'azul',
      };

      mockConsultationRepository.findOne.mockResolvedValue(
        mockConsultation,
      );
      mockAttendanceRepository.findOne.mockResolvedValue(mockAttendance);
      mockTreatmentRepository.create.mockReturnValue(
        mockTreatment,
      );
      mockTreatmentRepository.save.mockResolvedValue(
        mockTreatment,
      );
      mockTreatmentRepository.findOne.mockResolvedValue(
        mockTreatment,
      );

      const mockSessions = Array.from(
        { length: plannedSessions },
        (_, i) => ({
          id: i + 1,
          treatment_id: 1,
          session_number: i + 1,
          scheduled_date: startDate,
          status: 'scheduled',
        }),
      );
      mockSessionRepository.create.mockImplementation(
        (data) => data,
      );
      mockSessionRepository.save.mockResolvedValue(
        mockSessions,
      );

      const createdAttendances = [];
      mockAttendanceRepository.create.mockImplementation((data) => {
        createdAttendances.push(data);
        return data;
      });
      mockAttendanceRepository.save.mockResolvedValue({ id: 2 });

      await service.createTreatment({
        consultation_id: consultationId,
        attendance_id: attendanceId,
        patient_id: patientId,
        treatment_type: TreatmentType.PHYSIOTHERAPY,
        body_location: 'Cabeça',
        start_date: startDate,
        planned_sessions: plannedSessions,
        duration_minutes: 30,
        color: 'azul',
      });

      // Verify all treatment attendances link to the original consultation
      createdAttendances.forEach((attendance) => {
        expect(attendance.parent_attendance_id).toBe(attendanceId);
      });
    });
  });
});
