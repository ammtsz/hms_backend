import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemOption } from '../entities/system-option.entity';
import { Patient } from '../entities/patient.entity';
import { PatientNote } from '../entities/patient-note.entity';
import { Treatment } from '../entities/treatment.entity';
import { SettingsController } from '../controllers/settings.controller';
import { SystemOptionService } from '../services/system-option.service';
import { SystemSettingsModule } from './system-settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      SystemOption,
      Treatment,
      Patient,
      PatientNote,
    ]),
    SystemSettingsModule,
  ],
  controllers: [SettingsController],
  providers: [SystemOptionService],
  exports: [SystemOptionService],
})
export class SettingsModule {}
