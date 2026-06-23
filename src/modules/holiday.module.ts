import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from '../entities/holiday.entity';
import { Appointment } from '../entities/appointment.entity';
import { HolidayController } from '../controllers/holiday.controller';
import { HolidayService } from '../services/holiday.service';

/**
 * HolidayModule
 * Handles holiday management functionality - creating, updating, and checking holidays for appointment scheduling
 */
@Module({
  imports: [TypeOrmModule.forFeature([Holiday, Appointment])],
  controllers: [HolidayController],
  providers: [HolidayService],
  exports: [HolidayService],
})
export class HolidayModule {}
