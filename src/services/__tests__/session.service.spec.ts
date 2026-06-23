import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from '../session.service';
import { Session, SessionAppointmentStatus } from '../../entities/session.entity';
import { Treatment } from '../../entities/treatment.entity';
import { Appointment } from '../../entities/appointment.entity';
import { AppointmentService } from '../appointment.service';
import { AppointmentStatus } from '../../common/enums';
import { NotFoundException } from '@nestjs/common';

describe('SessionService', () => {
  let service: SessionService;
  let mockSessionRepository: { findOne: jest.Mock; save: jest.Mock };
  let mockAppointmentService: { syncStatusFromSession: jest.Mock };

  const baseSession = {
    id: 1,
    treatment_id: 1,
    appointment_id: 10,
    session_number: 1,
    scheduled_date: '2024-01-01',
    start_time: null,
    end_time: null,
    status: SessionAppointmentStatus.SCHEDULED,
    notes: null,
    missed_reason: null,
    performed_by: null,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  } as Session;

  beforeEach(async () => {
    mockSessionRepository = {
      findOne: jest.fn().mockResolvedValue({ ...baseSession }),
      save: jest.fn().mockImplementation((session) => Promise.resolve({ ...session })),
    };

    mockAppointmentService = {
      syncStatusFromSession: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepository,
        },
        {
          provide: getRepositoryToken(Treatment),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: getRepositoryToken(Appointment),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: AppointmentService,
          useValue: mockAppointmentService,
        },
      ],
    }).compile();

    service = module.get<SessionService>(
      SessionService,
    );
  });

  describe('updateSession', () => {
    it('should throw NotFoundException when session does not exist', async () => {
      mockSessionRepository.findOne.mockResolvedValueOnce(null);

      await expect(
        service.updateSession(999, { notes: 'test' }),
      ).rejects.toThrow(NotFoundException);
      expect(mockAppointmentService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should call syncStatusFromSession when status changes to COMPLETED and has appointment_id', async () => {
      const sessionWithAppointment = { ...baseSession, appointment_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAppointment);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAppointmentStatus.COMPLETED }),
      );

      await service.updateSession(1, { status: SessionAppointmentStatus.COMPLETED });

      expect(mockAppointmentService.syncStatusFromSession).toHaveBeenCalledWith(
        10,
        AppointmentStatus.COMPLETED,
        { cancellationReason: undefined },
      );
    });

    it('should call syncStatusFromSession with missed_reason when status changes to MISSED', async () => {
      const sessionWithAppointment = { ...baseSession, appointment_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAppointment);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({
          ...session,
          status: SessionAppointmentStatus.MISSED,
          missed_reason: 'Patient did not show up',
        }),
      );

      await service.updateSession(1, {
        status: SessionAppointmentStatus.MISSED,
        missed_reason: 'Patient did not show up',
      });

      expect(mockAppointmentService.syncStatusFromSession).toHaveBeenCalledWith(
        10,
        AppointmentStatus.MISSED,
        { cancellationReason: 'Patient did not show up' },
      );
    });

    it('should call syncStatusFromSession when status changes to CANCELLED', async () => {
      const sessionWithAppointment = { ...baseSession, appointment_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAppointment);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAppointmentStatus.CANCELLED }),
      );

      await service.updateSession(1, { status: SessionAppointmentStatus.CANCELLED });

      expect(mockAppointmentService.syncStatusFromSession).toHaveBeenCalledWith(
        10,
        AppointmentStatus.CANCELLED,
        { cancellationReason: undefined },
      );
    });

    it('should NOT call syncStatusFromSession when status changes to SCHEDULED', async () => {
      const completedSession = { ...baseSession, status: SessionAppointmentStatus.COMPLETED, appointment_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(completedSession);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAppointmentStatus.SCHEDULED }),
      );

      await service.updateSession(1, { status: SessionAppointmentStatus.SCHEDULED });

      expect(mockAppointmentService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should NOT call syncStatusFromSession when status does not change', async () => {
      const completedSession = { ...baseSession, status: SessionAppointmentStatus.COMPLETED, appointment_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(completedSession);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session }),
      );

      await service.updateSession(1, { notes: 'Updated notes only' });

      expect(mockAppointmentService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should NOT call syncStatusFromSession when dto.status is not provided', async () => {
      const sessionWithAppointment = { ...baseSession, appointment_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAppointment);

      await service.updateSession(1, { notes: 'Just notes' });

      expect(mockAppointmentService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should NOT call syncStatusFromSession when appointment_id is null', async () => {
      const sessionWithoutAppointment = { ...baseSession, appointment_id: null };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithoutAppointment);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAppointmentStatus.COMPLETED }),
      );

      await service.updateSession(1, { status: SessionAppointmentStatus.COMPLETED });

      expect(mockAppointmentService.syncStatusFromSession).not.toHaveBeenCalled();
    });
  });
});
