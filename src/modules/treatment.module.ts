import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Treatment } from '../entities/treatment.entity';
import { Session } from '../entities/session.entity';
import { Consultation } from '../entities/consultation.entity';
import { Appointment } from '../entities/appointment.entity';
import { Patient } from '../entities/patient.entity';
import { TreatmentService } from '../services/treatment.service';
import { TreatmentController } from '../controllers/treatment.controller';
import { AppointmentModule } from './appointment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Treatment,
      Session,
      Consultation,
      Appointment,
      Patient,
    ]),
    forwardRef(() => AppointmentModule),
  ],
  controllers: [TreatmentController],
  providers: [TreatmentService],
  exports: [TreatmentService],
})
export class TreatmentModule {}
