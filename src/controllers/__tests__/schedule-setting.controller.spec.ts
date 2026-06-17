import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleSettingController } from '../schedule-setting.controller';
import { ScheduleSettingService } from '../../services/schedule-setting.service';
import {
  CreateScheduleSettingDto,
  UpdateScheduleSettingDto,
  ScheduleSettingResponseDto,
} from '../../dtos/schedule-setting.dto';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('ScheduleSettingController', () => {
  let controller: ScheduleSettingController;
  let service: ScheduleSettingService;

  const mockScheduleSetting: ScheduleSettingResponseDto = {
    id: 1,
    day_of_week: 1,
    start_time: '09:00',
    end_time: '17:00',
    max_concurrent_assessment: 2,
    max_concurrent_physiotherapy_tens: 3,
    is_active: true,
    created_date: '2025-07-22',
    created_time: '09:00:00',
    updated_date: '2025-07-22',
    updated_time: '09:00:00',
  };

  const mockService = {
    create: jest.fn().mockResolvedValue(mockScheduleSetting),
    findAll: jest.fn().mockResolvedValue([mockScheduleSetting]),
    findOne: jest.fn().mockResolvedValue(mockScheduleSetting),
    findByDay: jest.fn().mockResolvedValue(mockScheduleSetting),
    update: jest.fn().mockResolvedValue(mockScheduleSetting),
    remove: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ScheduleSettingController],
      providers: [
        {
          provide: ScheduleSettingService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<ScheduleSettingController>(
      ScheduleSettingController,
    );
    service = module.get<ScheduleSettingService>(ScheduleSettingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('should create a new schedule setting', async () => {
      const createDto: CreateScheduleSettingDto = {
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      const result = await controller.create(createDto);

      expect(result).toEqual(mockScheduleSetting);
      expect(service.create).toHaveBeenCalledWith(createDto);
    });

    it('should handle BadRequestException', async () => {
      const createDto: CreateScheduleSettingDto = {
        day_of_week: 1,
        start_time: '09:00',
        end_time: '17:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      jest
        .spyOn(service, 'create')
        .mockRejectedValue(new BadRequestException());

      await expect(controller.create(createDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('findAll', () => {
    it('should return an array of schedule settings', async () => {
      const result = await controller.findAll();

      expect(result).toEqual([mockScheduleSetting]);
      expect(service.findAll).toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('should return a single schedule setting', async () => {
      const result = await controller.findOne('1');

      expect(result).toEqual(mockScheduleSetting);
      expect(service.findOne).toHaveBeenCalledWith(1);
    });

    it('should handle NotFoundException', async () => {
      jest.spyOn(service, 'findOne').mockRejectedValue(new NotFoundException());

      await expect(controller.findOne('999')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByDay', () => {
    it('should return a schedule setting for a specific day', async () => {
      const result = await controller.findByDay('1');

      expect(result).toEqual(mockScheduleSetting);
      expect(service.findByDay).toHaveBeenCalledWith(1);
    });

    it('should handle NotFoundException', async () => {
      jest
        .spyOn(service, 'findByDay')
        .mockRejectedValue(new NotFoundException());

      await expect(controller.findByDay('7')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('should update a schedule setting', async () => {
      const updateDto: UpdateScheduleSettingDto = {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      const result = await controller.update('1', updateDto);

      expect(result).toEqual(mockScheduleSetting);
      expect(service.update).toHaveBeenCalledWith(1, updateDto);
    });

    it('should handle NotFoundException', async () => {
      const updateDto: UpdateScheduleSettingDto = {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      jest.spyOn(service, 'update').mockRejectedValue(new NotFoundException());

      await expect(controller.update('999', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should handle BadRequestException', async () => {
      const updateDto: UpdateScheduleSettingDto = {
        day_of_week: 1,
        start_time: '10:00',
        end_time: '18:00',
        max_concurrent_assessment: 2,
        max_concurrent_physiotherapy_tens: 3,
        is_active: true,
      };

      jest
        .spyOn(service, 'update')
        .mockRejectedValue(new BadRequestException());

      await expect(controller.update('1', updateDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should remove a schedule setting', async () => {
      await controller.remove('1');

      expect(service.remove).toHaveBeenCalledWith(1);
    });

    it('should handle NotFoundException', async () => {
      jest.spyOn(service, 'remove').mockRejectedValue(new NotFoundException());

      await expect(controller.remove('999')).rejects.toThrow(NotFoundException);
    });
  });
});
