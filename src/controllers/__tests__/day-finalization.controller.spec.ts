import { Test, TestingModule } from '@nestjs/testing';
import { DayFinalizationController } from '../day-finalization.controller';
import { DayFinalizationService } from '../../services/day-finalization.service';
import { EndOfDayProcessService } from '../../services/end-of-day-process.service';
import { DayFinalization } from '../../entities/day-finalization.entity';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { ProcessEndOfDayRequestDto } from '../../dtos/process-end-of-day.dto';

describe('DayFinalizationController', () => {
  let controller: DayFinalizationController;
  let finalizationService: DayFinalizationService;
  let endOfDayProcessService: EndOfDayProcessService;

  const mockFinalization = {
    id: 1,
    finalization_date: '2024-01-15',
    finalized_at: new Date('2024-01-15T18:00:00Z'),
    notes: 'Test notes',
    created_date: '2024-01-15',
    created_time: '18:00:00',
  } as DayFinalization;

  const mockProcessResult = {
    rescheduled: [],
    status_changed_to_c: [],
    cancelled_for_c: [],
    could_not_reschedule: [],
  };

  const mockFinalizationService = {
    getFinalizationStatus: jest.fn().mockResolvedValue(null),
    finalizeDay: jest.fn().mockResolvedValue(mockFinalization),
  };

  const mockEndOfDayProcessService = {
    processEndOfDay: jest.fn().mockResolvedValue(mockProcessResult),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DayFinalizationController],
      providers: [
        {
          provide: DayFinalizationService,
          useValue: mockFinalizationService,
        },
        {
          provide: EndOfDayProcessService,
          useValue: mockEndOfDayProcessService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<DayFinalizationController>(DayFinalizationController);
    finalizationService = module.get<DayFinalizationService>(DayFinalizationService);
    endOfDayProcessService = module.get<EndOfDayProcessService>(EndOfDayProcessService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('processEndOfDay', () => {
    it('should process end-of-day and return result', async () => {
      const body: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [
          { appointment_id: 1, justified: false, notes: '' },
        ],
      };

      const result = await controller.processEndOfDay(body);

      expect(result).toEqual(mockProcessResult);
      expect(endOfDayProcessService.processEndOfDay).toHaveBeenCalledWith(body);
    });

    it('should handle empty absence justifications', async () => {
      const body: ProcessEndOfDayRequestDto = {
        date: '2024-01-15',
        absence_justifications: [],
      };

      const result = await controller.processEndOfDay(body);

      expect(result).toEqual(mockProcessResult);
      expect(endOfDayProcessService.processEndOfDay).toHaveBeenCalledWith(body);
    });
  });

  describe('getDayFinalizationStatus', () => {
    it('should return isFinalized false when no finalization exists', async () => {
      mockFinalizationService.getFinalizationStatus.mockResolvedValue(null);

      const result = await controller.getDayFinalizationStatus('2024-01-15');

      expect(result).toEqual({
        isFinalized: false,
        finalization: undefined,
      });
      expect(finalizationService.getFinalizationStatus).toHaveBeenCalledWith('2024-01-15');
    });

    it('should return isFinalized true with finalization when exists', async () => {
      mockFinalizationService.getFinalizationStatus.mockResolvedValue(mockFinalization);

      const result = await controller.getDayFinalizationStatus('2024-01-15');

      expect(result).toEqual({
        isFinalized: true,
        finalization: mockFinalization,
      });
    });
  });
});
