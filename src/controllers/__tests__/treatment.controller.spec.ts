import { Test, TestingModule } from '@nestjs/testing';
import { TreatmentController } from '../treatment.controller';
import { TreatmentService } from '../../services/treatment.service';
import {
  CreateTreatmentDto,
  UpdateTreatmentDto,
  TreatmentResponseDto,
} from '../../dtos/treatment.dto';

describe('TreatmentController', () => {
  let controller: TreatmentController;
  let service: TreatmentService;

  const mockTreatmentService = {
    createTreatment: jest.fn(),
    getTreatmentsByPatient: jest.fn(),
    getTreatmentById: jest.fn(),
    updateTreatment: jest.fn(),
    deleteTreatment: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TreatmentController],
      providers: [
        {
          provide: TreatmentService,
          useValue: mockTreatmentService,
        },
      ],
    }).compile();

    controller = module.get<TreatmentController>(
      TreatmentController,
    );
    service = module.get<TreatmentService>(TreatmentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Treatment Session Endpoints', () => {
    describe('createTreatment', () => {
      it('should create a treatment session', async () => {
        const dto: CreateTreatmentDto = {
          consultation_id: 1,
          appointment_id: 1,
          patient_id: 1,
          treatment_type: 'physiotherapy' as any,
          body_location: 'head',
          start_date: '2024-01-01',
          planned_sessions: 10,
          duration_minutes: 7,
          color: 'blue',
          notes: 'Test treatment',
        };

        const expected: TreatmentResponseDto = {
          id: 1,
          consultation_id: 1,
          appointment_id: 1,
          patient_id: 1,
          treatment_type: 'physiotherapy' as any,
          body_location: 'head',
          start_date: '2024-01-01',
          planned_sessions: 10,
          completed_sessions: 0,
          end_date: null,
          status: 'scheduled',
          duration_minutes: 7,
          color: 'blue',
          notes: 'Test treatment',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockTreatmentService.createTreatment.mockResolvedValue(
          expected,
        );

        const result = await controller.createTreatment(dto);

        expect(service.createTreatment).toHaveBeenCalledWith(dto);
        expect(result).toEqual(expected);
      });
    });

    describe('getTreatmentsByPatient', () => {
      it('should get treatment sessions by patient', async () => {
        const patientId = 1;
        const expected: TreatmentResponseDto[] = [
          {
            id: 1,
            consultation_id: 1,
            appointment_id: 1,
            patient_id: 1,
            treatment_type: 'physiotherapy' as any,
            body_location: 'head',
            start_date: '2024-01-01',
            planned_sessions: 10,
            completed_sessions: 0,
            end_date: null,
            status: 'scheduled',
            duration_minutes: 7,
            color: 'blue',
            notes: 'Test treatment',
            created_date: '2025-07-22',
            created_time: '09:00:00',
            updated_date: '2025-07-22',
            updated_time: '09:00:00',
          },
        ];

        mockTreatmentService.getTreatmentsByPatient.mockResolvedValue(
          expected,
        );

        const result =
          await controller.getTreatmentsByPatient(patientId);

        expect(service.getTreatmentsByPatient).toHaveBeenCalledWith(
          patientId,
        );
        expect(result).toEqual(expected);
      });
    });

    describe('getTreatmentById', () => {
      it('should get treatment session by ID', async () => {
        const sessionId = 1;
        const expected: TreatmentResponseDto = {
          id: 1,
          consultation_id: 1,
          appointment_id: 1,
          patient_id: 1,
          treatment_type: 'physiotherapy' as any,
          body_location: 'head',
          start_date: '2024-01-01',
          planned_sessions: 10,
          completed_sessions: 5,
          end_date: null,
          status: 'in_progress',
          duration_minutes: 7,
          color: 'blue',
          notes: 'Test treatment',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockTreatmentService.getTreatmentById.mockResolvedValue(
          expected,
        );

        const result = await controller.getTreatmentById(sessionId);

        expect(service.getTreatmentById).toHaveBeenCalledWith(sessionId);
        expect(result).toEqual(expected);
      });
    });

    describe('updateTreatment', () => {
      it('should update a treatment session', async () => {
        const sessionId = 1;
        const dto: UpdateTreatmentDto = {
          notes: 'Updated notes',
        };

        const expected: TreatmentResponseDto = {
          id: 1,
          consultation_id: 1,
          appointment_id: 1,
          patient_id: 1,
          treatment_type: 'physiotherapy' as any,
          body_location: 'head',
          start_date: '2024-01-01',
          planned_sessions: 10,
          completed_sessions: 5,
          end_date: null,
          status: 'in_progress',
          duration_minutes: 7,
          color: 'blue',
          notes: 'Updated notes',
          created_date: '2025-07-22',
          created_time: '09:00:00',
          updated_date: '2025-07-22',
          updated_time: '09:00:00',
        };

        mockTreatmentService.updateTreatment.mockResolvedValue(
          expected,
        );

        const result = await controller.updateTreatment(sessionId, dto);

        expect(service.updateTreatment).toHaveBeenCalledWith(
          sessionId,
          dto,
        );
        expect(result).toEqual(expected);
      });
    });

    describe('deleteTreatment', () => {
      it('should delete a treatment session', async () => {
        const sessionId = 1;

        mockTreatmentService.deleteTreatment.mockResolvedValue(
          undefined,
        );

        await controller.deleteTreatment(sessionId);

        expect(service.deleteTreatment).toHaveBeenCalledWith(sessionId);
      });
    });
  });
});
