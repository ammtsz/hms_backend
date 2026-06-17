import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('hms_holiday_template')
export class HolidayTemplate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'jsonb' })
  holidays: Array<{
    month: number; // 1-12
    day: number; // 1-31
    name: string;
    description?: string;
  }>;

  @CreateDateColumn({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;
}
