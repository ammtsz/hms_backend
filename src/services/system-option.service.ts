import {
  Injectable,
  ConflictException,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  SystemOption,
  SystemOptionType,
} from '../entities/system-option.entity';
import { Patient } from '../entities/patient.entity';
import { PatientNote } from '../entities/patient-note.entity';
import { PatientPriority } from '../common/enums';
import { Treatment } from '../entities/treatment.entity';
import {
  CreateSystemOptionDto,
  UpdateSystemOptionDto,
} from '../dtos/system-option.dto';

@Injectable()
export class SystemOptionService {
  private static readonly DEFAULT_NOTE_CATEGORY_VALUES = ['general', 'general'];

  constructor(
    @InjectRepository(SystemOption)
    private systemOptionRepository: Repository<SystemOption>,
    @InjectRepository(Treatment)
    private treatmentRepository: Repository<Treatment>,
    @InjectRepository(Patient)
    private patientRepository: Repository<Patient>,
    @InjectRepository(PatientNote)
    private patientNoteRepository: Repository<PatientNote>,
  ) {}

  async findAll(
    type: SystemOptionType,
    includeInactive = false,
  ): Promise<SystemOption[]> {
    const query = this.systemOptionRepository
      .createQueryBuilder('option')
      .where('option.type = :type', { type });

    if (!includeInactive) {
      query.andWhere('option.is_active = :isActive', { isActive: true });
    }

    if (
      type === SystemOptionType.PRIORITY ||
      type === SystemOptionType.NOTE_CATEGORY
    ) {
      query
        .orderBy('option.sortOrder', 'ASC')
        .addOrderBy('option.value', 'ASC');
    } else {
      query.orderBy('option.value', 'ASC');
    }

    return await query.getMany();
  }

  async findOne(id: number): Promise<SystemOption> {
    const option = await this.systemOptionRepository.findOne({
      where: { id },
    });
    if (!option) {
      throw new BadRequestException('System option not found');
    }
    return option;
  }

  async create(createDto: CreateSystemOptionDto): Promise<SystemOption> {
    const existing = await this.systemOptionRepository.findOne({
      where: { type: createDto.type, value: createDto.value },
    });

    if (existing) {
      throw new ConflictException(
        'This name already exists for this option type',
      );
    }

    const option = this.systemOptionRepository.create({
      type: createDto.type,
      value: createDto.value,
      label: createDto.label ?? null,
      sortOrder: createDto.sort_order ?? null,
      isActive: true,
    });
    return await this.systemOptionRepository.save(option);
  }

  async findSimilar(
    type: SystemOptionType,
    value: string,
  ): Promise<Array<{ id: number; value: string; similarity: number }>> {
    const allOptions = await this.findAll(type, true);
    const normalizedInput = this.normalizeName(value);
    const similarOptions: Array<{
      id: number;
      value: string;
      similarity: number;
    }> = [];

    for (const option of allOptions) {
      const normalizedOption = this.normalizeName(option.value);
      const similarity = this.calculateSimilarity(
        normalizedInput,
        normalizedOption,
      );

      if (similarity > 0.7 && similarity < 1.0) {
        similarOptions.push({
          id: option.id,
          value: option.value,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }

    return similarOptions.sort((a, b) => b.similarity - a.similarity);
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1.length < 2 || str2.length < 2) return 0;

    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    for (let i = 0; i <= len1; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    return matrix[len1][len2];
  }

  async update(
    id: number,
    updateDto: UpdateSystemOptionDto,
  ): Promise<SystemOption> {
    const option = await this.findOne(id);

    if (updateDto.value && updateDto.value !== option.value) {
      const existing = await this.systemOptionRepository.findOne({
        where: { type: option.type, value: updateDto.value },
      });

      if (existing) {
        throw new ConflictException(
          'This name already exists for this option type',
        );
      }
    }

    if (
      updateDto.is_active !== undefined &&
      updateDto.is_active === false &&
      option.type === SystemOptionType.PRIORITY
    ) {
      // Priority "1" is a system invariant: it must never be disabled.
      if (option.value === '1') {
        throw new BadRequestException('Priority 1 cannot be deactivated.');
      }

      const blockingPatients = await this.listPriorityPatients(option.value);
      if (blockingPatients.length > 0) {
        throw new HttpException(
          {
            message:
              'This priority cannot be deactivated because there are still patients using this level.',
            blocking_patients: blockingPatients,
          },
          HttpStatus.CONFLICT,
        );
      }
    }

    // Map snake_case DTO fields to entity camelCase properties
    if (updateDto.value !== undefined) {
      option.value = updateDto.value;
    }
    if (updateDto.is_active !== undefined) {
      option.isActive = updateDto.is_active;
    }
    if (updateDto.label !== undefined) {
      option.label = updateDto.label ?? null;
    }
    if (updateDto.sort_order !== undefined) {
      option.sortOrder = updateDto.sort_order ?? null;
    }

    return await this.systemOptionRepository.save(option);
  }

  async delete(id: number): Promise<void> {
    const option = await this.findOne(id);
    if (
      option.type === SystemOptionType.NOTE_CATEGORY &&
      SystemOptionService.DEFAULT_NOTE_CATEGORY_VALUES.includes(option.value)
    ) {
      throw new BadRequestException(
        "The default note category 'general' cannot be removed.",
      );
    }
    await this.systemOptionRepository.remove(option);
  }

  async getUsageCount(option: SystemOption): Promise<number> {
    if (option.type === SystemOptionType.BODY_LOCATION) {
      const result = await this.treatmentRepository
        .createQueryBuilder('session')
        .select('COALESCE(SUM(session.completed_sessions), 0)', 'total')
        .where('session.body_locations = :value', { value: option.value })
        .getRawOne();

      return parseInt(result?.total || '0', 10);
    }

    if (option.type === SystemOptionType.PRIORITY) {
      const result = await this.patientRepository
        .createQueryBuilder('patient')
        .select('COALESCE(COUNT(patient.id), 0)', 'total')
        .where('patient.priority = :value', { value: option.value })
        .getRawOne();

      return parseInt(result?.total || '0', 10);
    }

    // NOTE_CATEGORY
    const result = await this.patientNoteRepository
      .createQueryBuilder('note')
      .select('COALESCE(COUNT(note.id), 0)', 'total')
      .where('note.category = :value', { value: option.value })
      .getRawOne();

    return parseInt(result?.total || '0', 10);
  }

  async findAllWithUsageCount(type: SystemOptionType, includeInactive = false) {
    const options = await this.findAll(type, includeInactive);

    const optionsWithCount = await Promise.all(
      options.map(async (option) => ({
        ...option,
        usage_count: await this.getUsageCount(option),
      })),
    );

    return optionsWithCount;
  }

  async listPriorityPatients(priorityCode: string) {
    const patients = await this.patientRepository.find({
      where: { priority: priorityCode as PatientPriority },
      select: ['id', 'name', 'priority'],
    });
    return patients;
  }

  async deactivatePriority(optionId: number): Promise<SystemOption> {
    const option = await this.findOne(optionId);
    if (option.type !== SystemOptionType.PRIORITY) {
      throw new BadRequestException('This option is not a priority');
    }

    // Priority "1" is a system invariant: it must never be disabled.
    if (option.value === '1') {
      throw new BadRequestException('Priority 1 cannot be deactivated.');
    }

    const blockingPatients = await this.listPriorityPatients(option.value);
    if (blockingPatients.length > 0) {
      throw new HttpException(
        {
          message:
            'This priority cannot be deactivated because there are still patients using this option.',
          blocking_patients: blockingPatients,
        },
        HttpStatus.CONFLICT,
      );
    }

    option.isActive = false;
    return this.systemOptionRepository.save(option);
  }

  async bulkUpdatePatientsPriority(params: {
    patientIds: number[];
    priorityCode: string;
  }): Promise<{ updatedCount: number }> {
    const { patientIds, priorityCode } = params;

    if (!patientIds || patientIds.length === 0) {
      throw new BadRequestException('No patient selected');
    }

    const targetPriorityOption = await this.systemOptionRepository.findOne({
      where: {
        type: SystemOptionType.PRIORITY,
        value: priorityCode,
        isActive: true,
      },
    });

    if (!targetPriorityOption) {
      throw new BadRequestException(
        'Invalid or inactive priority. Select an active priority.',
      );
    }

    const result = await this.patientRepository.update(
      { id: In(patientIds) },
      { priority: priorityCode as PatientPriority },
    );

    return { updatedCount: result.affected ?? 0 };
  }
}
