import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import {
  CreateHolidayDto,
  UpdateHolidayDto,
  HolidayResponseDto,
  HolidayConflictDto,
  BulkCreateHolidayResultDto,
  CreateHolidayPeriodDto,
} from '../dtos/holiday.dto';
import { Holiday } from '../entities/holiday.entity';
import { Appointment } from '../entities/appointment.entity';
import { AppointmentStatus } from '../common/enums';
import { v4 as uuidv4 } from 'uuid';

/** Appointment statuses that block holiday creation (open appointments) */
const OPEN_APPOINTMENT_STATUSES: AppointmentStatus[] = [
  AppointmentStatus.SCHEDULED,
  AppointmentStatus.CHECKED_IN,
  AppointmentStatus.IN_PROGRESS,
];

@Injectable()
export class HolidayService {
  private readonly logger = new Logger(HolidayService.name);

  constructor(
    @InjectRepository(Holiday)
    private holidayRepository: Repository<Holiday>,
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,
  ) {}

  async findAll(year?: number): Promise<HolidayResponseDto[]> {
    const queryBuilder = this.holidayRepository
      .createQueryBuilder('holiday')
      .orderBy('holiday.holiday_date', 'ASC');

    if (year) {
      queryBuilder.where('EXTRACT(YEAR FROM holiday.holiday_date) = :year', {
        year,
      });
    }

    return await queryBuilder.getMany();
  }

  async findOne(id: number): Promise<HolidayResponseDto> {
    const holiday = await this.holidayRepository.findOne({ where: { id } });

    if (!holiday) {
      throw new NotFoundException(`Holiday with ID ${id} not found`);
    }

    return holiday;
  }

  async findByDate(date: string): Promise<HolidayResponseDto | null> {
    return await this.holidayRepository.findOne({
      where: { holiday_date: date },
    });
  }

  async checkConflicts(date: string): Promise<HolidayConflictDto> {
    const appointments = await this.appointmentRepository
      .createQueryBuilder('appointment')
      .leftJoinAndSelect('appointment.patient', 'patient')
      .where('appointment.scheduled_date = :date', { date })
      .andWhere('appointment.status IN (:...openStatuses)', {
        openStatuses: OPEN_APPOINTMENT_STATUSES,
      })
      .orderBy('patient.name', 'ASC')
      .getMany();

    return {
      hasConflict: appointments.length > 0,
      appointmentCount: appointments.length,
      appointments: appointments.map((a) => ({
        id: a.id,
        patient_name: a.patient.name,
        treatment_type: a.type,
      })),
    };
  }

  async create(createHolidayDto: CreateHolidayDto): Promise<HolidayResponseDto> {
    // Date is already a string in YYYY-MM-DD format from DTO validation
    const dateString = createHolidayDto.holiday_date;

    // Check if date is in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const holidayDate = new Date(dateString + 'T00:00:00');
    
    if (holidayDate < today) {
      throw new ConflictException('PAST_DATE');
    }

    // Check for conflicts
    const conflicts = await this.checkConflicts(dateString);

    if (conflicts.hasConflict) {
      this.logger.warn(
        `Cannot create holiday: ${conflicts.appointmentCount} appointment(s) scheduled for ${dateString}`,
      );
      throw new ConflictException(
        `APPOINTMENT_CONFLICT:${conflicts.appointmentCount}`,
      );
    }

    // Check if holiday already exists
    const existing = await this.findByDate(dateString);

    if (existing) {
      throw new ConflictException('DUPLICATE_HOLIDAY');
    }

    const holiday = this.holidayRepository.create({
      holiday_date: dateString,
      name: createHolidayDto.name,
      description: createHolidayDto.description || null,
      blocked_treatment_types: createHolidayDto.blocked_treatment_types || null,
      holiday_group_id: createHolidayDto.holiday_group_id || null,
    });

    const saved = await this.holidayRepository.save(holiday);

    this.logger.log(
      `Created holiday: ${createHolidayDto.name} on ${dateString}`,
    );
    return saved;
  }

  async bulkCreate(
    holidays: CreateHolidayDto[],
  ): Promise<BulkCreateHolidayResultDto> {
    const result: BulkCreateHolidayResultDto = {
      successCount: 0,
      failureCount: 0,
      errors: [],
    };

    for (const holiday of holidays) {
      try {
        await this.create(holiday);
        result.successCount++;
      } catch (error) {
        result.failureCount++;
        result.errors.push({
          holiday,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        this.logger.warn(
          `Failed to create holiday ${holiday.name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    this.logger.log(
      `Bulk create completed: ${result.successCount} succeeded, ${result.failureCount} failed`,
    );
    return result;
  }

  async update(
    id: number,
    updateHolidayDto: UpdateHolidayDto,
  ): Promise<HolidayResponseDto> {
    const holiday = await this.findOne(id);

    if (updateHolidayDto.name !== undefined) {
      holiday.name = updateHolidayDto.name;
    }
    if (updateHolidayDto.description !== undefined) {
      holiday.description = updateHolidayDto.description;
    }
    if (updateHolidayDto.blocked_treatment_types !== undefined) {
      holiday.blocked_treatment_types = updateHolidayDto.blocked_treatment_types;
    }

    const updated = await this.holidayRepository.save(holiday);

    this.logger.log(`Updated holiday ID ${id}`);
    return updated;
  }

  async updateGroup(
    holidayGroupId: string,
    updateHolidayDto: UpdateHolidayDto,
  ): Promise<HolidayResponseDto[]> {
    // Find all holidays in the group
    const holidays = await this.holidayRepository.find({
      where: { holiday_group_id: holidayGroupId }
    });
    
    if (holidays.length === 0) {
      throw new NotFoundException(`Holiday group with ID ${holidayGroupId} not found`);
    }

    // Update all holidays in the group
    holidays.forEach(holiday => {
      if (updateHolidayDto.name !== undefined) {
        holiday.name = updateHolidayDto.name;
      }
      if (updateHolidayDto.description !== undefined) {
        holiday.description = updateHolidayDto.description;
      }
      if (updateHolidayDto.blocked_treatment_types !== undefined) {
        holiday.blocked_treatment_types = updateHolidayDto.blocked_treatment_types;
      }
    });

    const updated = await this.holidayRepository.save(holidays);

    this.logger.log(`Updated holiday group ${holidayGroupId} - ${holidays.length} holidays`);
    return updated;
  }

  async remove(id: number): Promise<void> {
    const holiday = await this.holidayRepository.findOne({ where: { id } });
    
    if (!holiday) {
      throw new NotFoundException(`Holiday with ID ${id} not found`);
    }
    
    // If this holiday is part of a group (period), delete all holidays in the group
    if (holiday.holiday_group_id) {
      const groupHolidays = await this.holidayRepository.find({
        where: { holiday_group_id: holiday.holiday_group_id }
      });
      
      await this.holidayRepository.remove(groupHolidays);
      this.logger.log(`Deleted holiday group ${holiday.holiday_group_id} with ${groupHolidays.length} holidays`);
    } else {
      // Single holiday deletion
      await this.holidayRepository.remove(holiday);
      this.logger.log(`Deleted holiday ID ${id}`);
    }
  }

  async getUpcomingHolidays(limit: number = 5): Promise<HolidayResponseDto[]> {
    const today = new Date().toISOString().split('T')[0];

    return await this.holidayRepository.find({
      where: {
        holiday_date: MoreThanOrEqual(today),
      },
      order: {
        holiday_date: 'ASC',
      },
      take: limit,
    });
  }

  async isHoliday(date: string): Promise<boolean> {
    const holiday = await this.holidayRepository.findOne({
      where: { holiday_date: date },
    });

    return !!holiday;
  }

  /**
   * Check if a specific date is a holiday and blocks the given treatment type
   * @param date - Date in YYYY-MM-DD format
   * @param treatmentType - Treatment type to check ('assessment', 'physiotherapy', 'tens')
   * @returns true if the date is a holiday that blocks this treatment type
   */
  async isHolidayForTreatment(date: string, treatmentType: string): Promise<boolean> {
    const holiday = await this.holidayRepository.findOne({
      where: { holiday_date: date },
    });

    if (!holiday) {
      return false; // Not a holiday at all
    }

    // null or undefined = all treatment types blocked (default behavior)
    if (!holiday.blocked_treatment_types) {
      return true;
    }

    // Empty array = no treatment types blocked (holiday doesn't block anything)
    if (holiday.blocked_treatment_types.length === 0) {
      return false;
    }

    // Array with values = only specified treatment types are blocked
    return holiday.blocked_treatment_types.includes(treatmentType);
  }

  /**
   * Create a holiday period — multiple holiday rows sharing the same group ID
   * @param createPeriodDto Period details with start/end dates
   * @returns Result with success/failure counts
   */
  async createHolidayPeriod(createPeriodDto: CreateHolidayPeriodDto): Promise<BulkCreateHolidayResultDto> {
    const { start_date, end_date, name, description, blocked_treatment_types } = createPeriodDto;
    
    // Validate date range using YYYY-MM-DD string comparison (timezone-agnostic)
    if (start_date > end_date) {
      throw new ConflictException('End date must be after or equal to start date');
    }

    const appointmentCount = await this.appointmentRepository
      .createQueryBuilder('appointment')
      .where('appointment.scheduled_date BETWEEN :start AND :end', {
        start: start_date,
        end: end_date,
      })
      .andWhere('appointment.status IN (:...openStatuses)', {
        openStatuses: OPEN_APPOINTMENT_STATUSES,
      })
      .getCount();

    if (appointmentCount > 0) {
      this.logger.warn(
        `Cannot create holiday period: ${appointmentCount} appointment(s) scheduled between ${start_date} and ${end_date}`,
      );
      throw new ConflictException(`APPOINTMENT_CONFLICT:${appointmentCount}`);
    }

    const existingHolidayCount = await this.holidayRepository
      .createQueryBuilder('holiday')
      .where('holiday.holiday_date BETWEEN :start AND :end', {
        start: start_date,
        end: end_date,
      })
      .getCount();

    if (existingHolidayCount > 0) {
      throw new ConflictException('DUPLICATE_HOLIDAY');
    }
    
    // Generate UUID for the holiday group
    const holidayGroupId = uuidv4();
    
    // Generate all dates in the range
    const dates = this.generateDateRange(start_date, end_date);
    
    // Create holiday DTOs for each date in the period
    const holidays: CreateHolidayDto[] = dates.map(date => ({
      holiday_date: date,
      name,
      description,
      blocked_treatment_types,
      holiday_group_id: holidayGroupId,
    }));
    
    this.logger.log(`Creating holiday period "${name}" from ${start_date} to ${end_date} (${dates.length} days) with group ID ${holidayGroupId}`);
    
    // Use existing bulk creation logic
    return this.bulkCreate(holidays);
  }

  /**
   * Generate array of date strings between start and end dates (inclusive)
   * Uses string manipulation to avoid timezone-related bugs
   * @param startDate Start date in YYYY-MM-DD format
   * @param endDate End date in YYYY-MM-DD format
   * @returns Array of date strings in YYYY-MM-DD format
   */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const dates: string[] = [];

    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);

    let currentUtc = Date.UTC(startYear, startMonth - 1, startDay);
    const endUtc = Date.UTC(endYear, endMonth - 1, endDay);

    while (currentUtc <= endUtc) {
      const currentDate = new Date(currentUtc);
      dates.push(
        `${currentDate.getUTCFullYear()}-${String(currentDate.getUTCMonth() + 1).padStart(2, '0')}-${String(currentDate.getUTCDate()).padStart(2, '0')}`,
      );
      currentUtc += 24 * 60 * 60 * 1000;
    }

    return dates;
  }
}
