import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SessionService } from '../session.service';
import { Session, SessionAttendanceStatus } from '../../entities/session.entity';
import { Treatment } from '../../entities/treatment.entity';
import { Attendance } from '../../entities/attendance.entity';
import { AttendanceService } from '../attendance.service';
import { AttendanceStatus } from '../../common/enums';
import { NotFoundException } from '@nestjs/common';

describe('SessionService', () => {
  let service: SessionService;
  let mockSessionRepository: { findOne: jest.Mock; save: jest.Mock };
  let mockAttendanceService: { syncStatusFromSession: jest.Mock };

  const baseSession = {
    id: 1,
    treatment_id: 1,
    attendance_id: 10,
    session_number: 1,
    scheduled_date: '2024-01-01',
    start_time: null,
    end_time: null,
    status: SessionAttendanceStatus.SCHEDULED,
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

    mockAttendanceService = {
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
          provide: getRepositoryToken(Attendance),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: AttendanceService,
          useValue: mockAttendanceService,
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
      expect(mockAttendanceService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should call syncStatusFromSession when status changes to COMPLETED and has attendance_id', async () => {
      const sessionWithAttendance = { ...baseSession, attendance_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAttendance);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAttendanceStatus.COMPLETED }),
      );

      await service.updateSession(1, { status: SessionAttendanceStatus.COMPLETED });

      expect(mockAttendanceService.syncStatusFromSession).toHaveBeenCalledWith(
        10,
        AttendanceStatus.COMPLETED,
        { cancellationReason: undefined },
      );
    });

    it('should call syncStatusFromSession with missed_reason when status changes to MISSED', async () => {
      const sessionWithAttendance = { ...baseSession, attendance_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAttendance);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({
          ...session,
          status: SessionAttendanceStatus.MISSED,
          missed_reason: 'Patient did not show up',
        }),
      );

      await service.updateSession(1, {
        status: SessionAttendanceStatus.MISSED,
        missed_reason: 'Patient did not show up',
      });

      expect(mockAttendanceService.syncStatusFromSession).toHaveBeenCalledWith(
        10,
        AttendanceStatus.MISSED,
        { cancellationReason: 'Patient did not show up' },
      );
    });

    it('should call syncStatusFromSession when status changes to CANCELLED', async () => {
      const sessionWithAttendance = { ...baseSession, attendance_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAttendance);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAttendanceStatus.CANCELLED }),
      );

      await service.updateSession(1, { status: SessionAttendanceStatus.CANCELLED });

      expect(mockAttendanceService.syncStatusFromSession).toHaveBeenCalledWith(
        10,
        AttendanceStatus.CANCELLED,
        { cancellationReason: undefined },
      );
    });

    it('should NOT call syncStatusFromSession when status changes to SCHEDULED', async () => {
      const completedSession = { ...baseSession, status: SessionAttendanceStatus.COMPLETED, attendance_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(completedSession);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAttendanceStatus.SCHEDULED }),
      );

      await service.updateSession(1, { status: SessionAttendanceStatus.SCHEDULED });

      expect(mockAttendanceService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should NOT call syncStatusFromSession when status does not change', async () => {
      const completedSession = { ...baseSession, status: SessionAttendanceStatus.COMPLETED, attendance_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(completedSession);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session }),
      );

      await service.updateSession(1, { notes: 'Updated notes only' });

      expect(mockAttendanceService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should NOT call syncStatusFromSession when dto.status is not provided', async () => {
      const sessionWithAttendance = { ...baseSession, attendance_id: 10 };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithAttendance);

      await service.updateSession(1, { notes: 'Just notes' });

      expect(mockAttendanceService.syncStatusFromSession).not.toHaveBeenCalled();
    });

    it('should NOT call syncStatusFromSession when attendance_id is null', async () => {
      const sessionWithoutAttendance = { ...baseSession, attendance_id: null };
      mockSessionRepository.findOne.mockResolvedValueOnce(sessionWithoutAttendance);
      mockSessionRepository.save.mockImplementation((session) =>
        Promise.resolve({ ...session, status: SessionAttendanceStatus.COMPLETED }),
      );

      await service.updateSession(1, { status: SessionAttendanceStatus.COMPLETED });

      expect(mockAttendanceService.syncStatusFromSession).not.toHaveBeenCalled();
    });
  });
});
