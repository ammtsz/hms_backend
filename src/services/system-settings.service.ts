import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSetting } from '../entities/system-setting.entity';

export const KEY_MISSING_APPOINTMENTS_THRESHOLD = 'missing_appointments_threshold';
const DEFAULT_MISSING_APPOINTMENTS_THRESHOLD = 3;
const MIN_THRESHOLD = 1;
const MAX_THRESHOLD = 10;

@Injectable()
export class SystemSettingsService {
  private readonly logger = new Logger(SystemSettingsService.name);

  constructor(
    @InjectRepository(SystemSetting)
    private readonly systemSettingRepository: Repository<SystemSetting>,
  ) {}

  /**
   * Returns the configured threshold for unjustified absences that trigger status F.
   * Defaults to 3 if not set or invalid.
   */
  async getMissingAppointmentsThreshold(): Promise<number> {
    const row = await this.systemSettingRepository.findOne({
      where: { key: KEY_MISSING_APPOINTMENTS_THRESHOLD },
    });
    if (!row?.value) {
      return DEFAULT_MISSING_APPOINTMENTS_THRESHOLD;
    }
    const parsed = parseInt(row.value, 10);
    if (
      Number.isNaN(parsed) ||
      parsed < MIN_THRESHOLD ||
      parsed > MAX_THRESHOLD
    ) {
      this.logger.warn(
        `Invalid ${KEY_MISSING_APPOINTMENTS_THRESHOLD} value "${row.value}", using default ${DEFAULT_MISSING_APPOINTMENTS_THRESHOLD}`,
      );
      return DEFAULT_MISSING_APPOINTMENTS_THRESHOLD;
    }
    return parsed;
  }

  /**
   * Sets the missing appointments threshold (1–10). Validates and persists.
   */
  async setMissingAppointmentsThreshold(value: number): Promise<number> {
    if (value < MIN_THRESHOLD || value > MAX_THRESHOLD) {
      throw new Error(
        `missing_appointments_threshold must be between ${MIN_THRESHOLD} and ${MAX_THRESHOLD}`,
      );
    }
    await this.systemSettingRepository.upsert(
      {
        key: KEY_MISSING_APPOINTMENTS_THRESHOLD,
        value: String(value),
      },
      { conflictPaths: ['key'] },
    );
    return value;
  }
}
