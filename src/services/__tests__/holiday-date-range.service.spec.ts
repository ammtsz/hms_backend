jest.mock('uuid', () => ({ v4: () => 'test-holiday-group-id' }));

import { HolidayService } from '../holiday.service';
import { CreateHolidayPeriodDto } from '../../dtos/holiday.dto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Holiday } from '../../entities/holiday.entity';
import { Attendance } from '../../entities/attendance.entity';
import { AttendanceStatus } from '../../common/enums';

describe('HolidayService - generateDateRange', () => {
  let service: HolidayService;
  let attendanceQueryBuilder: {
    where: jest.Mock;
    andWhere: jest.Mock;
    getCount: jest.Mock;
  };
  let holidayQueryBuilder: {
    where: jest.Mock;
    getCount: jest.Mock;
  };

  beforeEach(async () => {
    attendanceQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };

    holidayQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayService,
        {
          provide: getRepositoryToken(Holiday),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn(() => holidayQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Attendance),
          useValue: {
            createQueryBuilder: jest.fn(() => attendanceQueryBuilder),
          },
        },
      ],
    }).compile();

    service = module.get<HolidayService>(HolidayService);
  });

  it('should generate consecutive dates without skipping any day', () => {
    // Test the exact scenario from the bug report
    const startDate = '2026-02-08'; // Sunday
    const endDate = '2026-02-14';   // Saturday
    
    // Access the private method through type assertion for testing
    const dates = (service as any).generateDateRange(startDate, endDate);
    
    expect(dates).toEqual([
      '2026-02-08', // Sunday
      '2026-02-09', // Monday
      '2026-02-10', // Tuesday
      '2026-02-11', // Wednesday
      '2026-02-12', // Thursday - This was being skipped!
      '2026-02-13', // Friday
      '2026-02-14', // Saturday
    ]);
    
    expect(dates.length).toBe(7);
  });

  it('should generate consecutive dates for second scenario', () => {
    // Test the second scenario from the bug report
    const startDate = '2026-02-15'; // Sunday
    const endDate = '2026-02-21';   // Saturday
    
    const dates = (service as any).generateDateRange(startDate, endDate);
    
    expect(dates).toEqual([
      '2026-02-15', // Sunday
      '2026-02-16', // Monday - This was being skipped!
      '2026-02-17', // Tuesday
      '2026-02-18', // Wednesday
      '2026-02-19', // Thursday
      '2026-02-20', // Friday
      '2026-02-21', // Saturday
    ]);
    
    expect(dates.length).toBe(7);
  });

  it('should work with single day range', () => {
    const dates = (service as any).generateDateRange('2026-02-10', '2026-02-10');
    expect(dates).toEqual(['2026-02-10']);
    expect(dates.length).toBe(1);
  });

  it('should work with month boundaries', () => {
    const dates = (service as any).generateDateRange('2026-01-30', '2026-02-02');
    expect(dates).toEqual([
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
    ]);
    expect(dates.length).toBe(4);
  });

  it('should work with leap year February', () => {
    const dates = (service as any).generateDateRange('2024-02-28', '2024-03-01');
    expect(dates).toEqual([
      '2024-02-28',
      '2024-02-29', // Leap year day
      '2024-03-01',
    ]);
    expect(dates.length).toBe(3);
  });

  it('should create a full period without skipping dates', async () => {
    const bulkCreateSpy = jest
      .spyOn(service, 'bulkCreate')
      .mockResolvedValue({
        successCount: 7,
        failureCount: 0,
        errors: [],
      });

    const createPeriodDto: CreateHolidayPeriodDto = {
      start_date: '2026-02-08',
      end_date: '2026-02-14',
      name: 'Semana de teste',
      description: 'Período completo de 7 dias',
      blocked_treatment_types: ['assessment'],
    };

    await service.createHolidayPeriod(createPeriodDto);

    expect(bulkCreateSpy).toHaveBeenCalledTimes(1);

    const [holidays] = bulkCreateSpy.mock.calls[0];
    expect(holidays).toHaveLength(7);
    expect(holidays[0]).toMatchObject({
      holiday_date: '2026-02-08',
      holiday_group_id: 'test-holiday-group-id',
      name: 'Semana de teste',
    });
    expect(holidays[6]).toMatchObject({
      holiday_date: '2026-02-14',
      holiday_group_id: 'test-holiday-group-id',
      name: 'Semana de teste',
    });
  });

  it('should block period creation when attendances exist in range', async () => {
    attendanceQueryBuilder.getCount.mockResolvedValueOnce(2);

    const createPeriodDto: CreateHolidayPeriodDto = {
      start_date: '2026-02-08',
      end_date: '2026-02-14',
      name: 'Semana de teste',
      description: 'Período com conflito',
      blocked_treatment_types: ['assessment'],
    };

    await expect(service.createHolidayPeriod(createPeriodDto)).rejects.toThrow(
      'ATTENDANCE_CONFLICT:2',
    );
  });

  it('should only count open attendances (scheduled, checked_in, in_progress) for period conflict', async () => {
    await service.createHolidayPeriod({
      start_date: '2026-02-08',
      end_date: '2026-02-14',
      name: 'Semana de teste',
      description: null,
      blocked_treatment_types: null,
    });

    expect(attendanceQueryBuilder.andWhere).toHaveBeenCalledWith(
      'attendance.status IN (:...openStatuses)',
      {
        openStatuses: [
          AttendanceStatus.SCHEDULED,
          AttendanceStatus.CHECKED_IN,
          AttendanceStatus.IN_PROGRESS,
        ],
      },
    );
  });
});