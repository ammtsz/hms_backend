import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consultation } from '../entities/consultation.entity';
import { Attendance } from '../entities/attendance.entity';
import { Patient } from '../entities/patient.entity';
import { ConsultationController } from '../controllers/consultation.controller';
import { ConsultationService } from '../services/consultation.service';
import { TreatmentModule } from './treatment.module';
import { AttendanceModule } from './attendance.module';
import { PatientModule } from './patient.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Consultation, Attendance, Patient]),
    TreatmentModule,
    AttendanceModule,
    PatientModule,
  ],
  controllers: [ConsultationController],
  providers: [ConsultationService],
  exports: [ConsultationService],
})
export class ConsultationModule {}
