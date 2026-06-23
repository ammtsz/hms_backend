import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session } from '../entities/session.entity';
import { Treatment } from '../entities/treatment.entity';
import { Appointment } from '../entities/appointment.entity';
import { SessionService } from '../services/session.service';
import { SessionController } from '../controllers/session.controller';
import { AppointmentModule } from './appointment.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Session,
      Treatment,
      Appointment,
    ]),
    forwardRef(() => AppointmentModule),
  ],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
