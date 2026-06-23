import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HolidayTemplate } from '../entities/holiday-template.entity';
import {
  CreateHolidayTemplateDto,
  UpdateHolidayTemplateDto,
  HolidayTemplateResponseDto,
  ApplyHolidayTemplateResultDto,
} from '../dtos/holiday-template.dto';
import { HolidayService } from './holiday.service';
import { CreateHolidayDto } from '../dtos/holiday.dto';

@Injectable()
export class HolidayTemplateService {
  private readonly logger = new Logger(HolidayTemplateService.name);

  constructor(
    @InjectRepository(HolidayTemplate)
    private templateRepository: Repository<HolidayTemplate>,
    private holidayService: HolidayService,
  ) {}

  async findAll(): Promise<HolidayTemplateResponseDto[]> {
    return await this.templateRepository.find({
      order: { created_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<HolidayTemplateResponseDto> {
    const template = await this.templateRepository.findOne({ where: { id } });

    if (!template) {
      throw new NotFoundException(`Holiday template with ID ${id} not found`);
    }

    return template;
  }

  async create(
    createDto: CreateHolidayTemplateDto,
  ): Promise<HolidayTemplateResponseDto> {
    this.logger.log(`Creating template: ${createDto.name}`);
    this.logger.debug(`Template data: ${JSON.stringify(createDto)}`);

    const template = this.templateRepository.create({
      name: createDto.name,
      description: createDto.description,
      holidays: createDto.holidays,
    });

    const saved = await this.templateRepository.save(template);
    this.logger.log(`Template created with ID: ${saved.id}`);
    
    return saved;
  }

  async update(
    id: number,
    updateDto: UpdateHolidayTemplateDto,
  ): Promise<HolidayTemplateResponseDto> {
    const template = await this.findOne(id);

    if (updateDto.name) template.name = updateDto.name;
    if (updateDto.description !== undefined)
      template.description = updateDto.description;
    if (updateDto.holidays) template.holidays = updateDto.holidays;

    return await this.templateRepository.save(template);
  }

  async remove(id: number): Promise<void> {
    const result = await this.templateRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Holiday template with ID ${id} not found`);
    }
  }

  async applyTemplate(
    id: number,
    year: number,
  ): Promise<ApplyHolidayTemplateResultDto> {
    const template = await this.findOne(id);

    const result: ApplyHolidayTemplateResultDto = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    for (const holidayItem of template.holidays) {
      try {
        // Create date string in YYYY-MM-DD format
        const month = String(holidayItem.month).padStart(2, '0');
        const day = String(holidayItem.day).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;

        // Validate date exists (handles invalid dates like Feb 31)
        const testDate = new Date(dateStr + 'T00:00:00');
        if (
          testDate.getMonth() + 1 !== holidayItem.month ||
          testDate.getDate() !== holidayItem.day
        ) {
          throw new Error(`Invalid date (does not exist on the calendar)`);
        }

        // Check if date is in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const holidayDate = new Date(testDate);
        
        if (holidayDate < today) {
          throw new Error(`Cannot add holidays on past dates`);
        }

        const createDto: CreateHolidayDto = {
          holiday_date: dateStr,
          name: holidayItem.name,
          description: holidayItem.description,
        };

        await this.holidayService.create(createDto);
        result.successCount++;
      } catch (error) {
        result.failureCount++;
        
        // Provide user-friendly error messages
        let errorMessage = 'Unknown error';
        
        if (error instanceof Error) {
          // Map English error codes to user-friendly messages
          if (error.message.includes('PAST_DATE')) {
            errorMessage = 'Cannot add holidays on past dates';
          } else if (error.message.includes('DUPLICATE_HOLIDAY')) {
            errorMessage = 'A holiday already exists for this date';
          } else if (error.message.includes('APPOINTMENT_CONFLICT')) {
            const count = error.message.split(':')[1];
            errorMessage = `There are ${count} scheduled appointment(s) for this date`;
          } else if (error.message.includes('does not exist on the calendar')) {
            errorMessage = 'Invalid date (does not exist on the calendar)';
          } else {
            errorMessage = error.message;
          }
        }
        
        result.errors.push({
          date: `${String(holidayItem.day).padStart(2, '0')}/${String(holidayItem.month).padStart(2, '0')}/${year}`,
          name: holidayItem.name,
          error: errorMessage,
        });
      }
    }

    return result;
  }
}
