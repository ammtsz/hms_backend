import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HolidayTemplate } from '../entities/holiday-template.entity';
import { HolidayTemplateService } from '../services/holiday-template.service';
import { HolidayTemplateController } from '../controllers/holiday-template.controller';
import { HolidayModule } from './holiday.module';

@Module({
  imports: [TypeOrmModule.forFeature([HolidayTemplate]), HolidayModule],
  controllers: [HolidayTemplateController],
  providers: [HolidayTemplateService],
  exports: [HolidayTemplateService],
})
export class HolidayTemplateModule {}
