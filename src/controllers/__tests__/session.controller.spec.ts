import { Test, TestingModule } from '@nestjs/testing';
import { SessionController } from '../session.controller';
import { SessionService } from '../../services/session.service';
import {
  CreateSessionDto,
  UpdateSessionDto,
  SessionResponseDto,
} from '../../dtos/session.dto';
import { SessionAppointmentStatus } from '../../entities/session.entity';

describe('SessionController', () => {
  let controller: SessionController;
  let service: SessionService;

  const mockSessionService = {
    createSession: jest.fn(),
    getSessionById: jest.fn(),
    getSessionsByTreatment: jest.fn(),
    updateSession: jest.fn(),
    deleteSession: jest.fn(),
    completeSession: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionController],
      providers: [
        {
          provide: SessionService,
          useValue: mockSessionService,
        },
      ],
    }).compile();

    controller = module.get<SessionController>(
      SessionController,
    );
    service = module.get<SessionService>(
      SessionService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('CRUD Operations', () => {
    describe('createSession', () => {
      it('should create a session', async () => {
        const dto: CreateSessionDto = {
          treatment_id: 1,
          session_number: 1,
          scheduled_date: '2024-01-01',
          notes: 'First session',
        };

        const expected: SessionResponseDto = {
          id: 1,
          treatment_id: 1,
          appointment_id: undefined,
          session_number: 1,
          scheduled_date: '2024-01-01',
          start_time: undefined,
          end_time: undefined,
          status: SessionAppointmentStatus.SCHEDULED,
          notes: 'First session',
          missed_reason: undefined,
          performed_by: undefined,
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockSessionService.createSession.mockResolvedValue(
          expected,
        );

        const result = await controller.createSession(dto);

        expect(service.createSession).toHaveBeenCalledWith(dto);
        expect(result).toEqual(expected);
      });
    });

    describe('getSessionById', () => {
      it('should get session by ID', async () => {
        const recordId = 1;
        const expected: SessionResponseDto = {
          id: 1,
          treatment_id: 1,
          appointment_id: 1,
          session_number: 1,
          scheduled_date: '2024-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          status: SessionAppointmentStatus.COMPLETED,
          notes: 'Session completed successfully',
          missed_reason: undefined,
          performed_by: 'Dr. Smith',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockSessionService.getSessionById.mockResolvedValue(
          expected,
        );

        const result = await controller.getSessionById(recordId);

        expect(service.getSessionById).toHaveBeenCalledWith(recordId);
        expect(result).toEqual(expected);
      });
    });

    describe('getSessionsByTreatment', () => {
      it('should get sessions by treatment', async () => {
        const treatmentSessionId = 1;
        const expected: SessionResponseDto[] = [
          {
            id: 1,
            treatment_id: 1,
            appointment_id: 1,
            session_number: 1,
            scheduled_date: '2024-01-01',
            start_time: '10:00:00',
            end_time: '10:30:00',
            status: SessionAppointmentStatus.COMPLETED,
            notes: 'Session completed',
            missed_reason: undefined,
            performed_by: 'Dr. Smith',
            created_date: '2025-07-22',
            created_time: '09:00:00',
            updated_date: '2025-07-22',
            updated_time: '09:00:00',
          },
        ];

        mockSessionService.getSessionsByTreatment.mockResolvedValue(
          expected,
        );

        const result =
          await controller.getSessionsByTreatment(treatmentSessionId);

        expect(service.getSessionsByTreatment).toHaveBeenCalledWith(
          treatmentSessionId,
        );
        expect(result).toEqual(expected);
      });
    });

    describe('updateSession', () => {
      it('should update a session', async () => {
        const recordId = 1;
        const dto: UpdateSessionDto = {
          notes: 'Updated session notes',
        };

        const expected: SessionResponseDto = {
          id: 1,
          treatment_id: 1,
          appointment_id: 1,
          session_number: 1,
          scheduled_date: '2024-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          status: SessionAppointmentStatus.COMPLETED,
          notes: 'Updated session notes',
          missed_reason: undefined,
          performed_by: 'Dr. Smith',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockSessionService.updateSession.mockResolvedValue(
          expected,
        );

        const result = await controller.updateSession(recordId, dto);

        expect(service.updateSession).toHaveBeenCalledWith(recordId, dto);
        expect(result).toEqual(expected);
      });
    });

    describe('deleteSession', () => {
      it('should delete a session', async () => {
        const recordId = 1;

        mockSessionService.deleteSession.mockResolvedValue(
          undefined,
        );

        await controller.deleteSession(recordId);

        expect(service.deleteSession).toHaveBeenCalledWith(recordId);
      });
    });
  });

  describe('Business Logic Operations', () => {
    describe('completeSession', () => {
      it('should complete a session', async () => {
        const recordId = 1;
        const completeDto = {
          appointmentId: 1,
          notes: 'Session completed successfully',
        };

        const expected: SessionResponseDto = {
          id: 1,
          treatment_id: 1,
          appointment_id: 1,
          session_number: 1,
          scheduled_date: '2024-01-01',
          start_time: '10:00:00',
          end_time: '10:30:00',
          status: SessionAppointmentStatus.COMPLETED,
          notes: 'Session completed successfully',
          missed_reason: undefined,
          performed_by: 'Dr. Smith',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockSessionService.completeSession.mockResolvedValue(
          expected,
        );

        const result = await controller.completeSession(recordId, completeDto);

        expect(service.completeSession).toHaveBeenCalledWith(
          recordId,
          completeDto.appointmentId,
          completeDto.notes,
        );
        expect(result).toEqual(expected);
      });
    });
  });
});
