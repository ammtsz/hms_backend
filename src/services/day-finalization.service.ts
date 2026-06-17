import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DayFinalization } from '../entities/day-finalization.entity';

/**
 * DayFinalizationService
 * Manages day finalization rows — tracks which dates have completed end-of-day processing
 */
@Injectable()
export class DayFinalizationService {
  constructor(
    @InjectRepository(DayFinalization)
    private finalizationRepository: Repository<DayFinalization>,
  ) {}

  /**
   * Check if a specific date is finalized
   * @param date Date string in YYYY-MM-DD format
   * @returns true if date is finalized, false otherwise
   */
  async isDayFinalized(date: string): Promise<boolean> {
    const finalization = await this.finalizationRepository.findOne({
      where: { finalization_date: date },
    });
    return !!finalization;
  }

  /**
   * Mark a day as finalized
   * @param date Date string in YYYY-MM-DD format
   * @param notes Optional notes about finalization
   * @returns DayFinalization entity
   */
  async finalizeDay(date: string, notes?: string): Promise<DayFinalization> {
    // Check if already finalized (idempotent operation)
    const existing = await this.finalizationRepository.findOne({
      where: { finalization_date: date },
    });

    if (existing) {
      return existing; // Already finalized, return existing row
    }

    // Create new finalization row
    const finalization = this.finalizationRepository.create({
      finalization_date: date,
      finalized_at: new Date(),
      notes,
    });

    return await this.finalizationRepository.save(finalization);
  }

  /**
   * Get finalization status for a specific date
   * @param date Date string in YYYY-MM-DD format
   * @returns DayFinalization entity or null if not finalized
   */
  async getFinalizationStatus(date: string): Promise<DayFinalization | null> {
    return await this.finalizationRepository.findOne({
      where: { finalization_date: date },
    });
  }
}
