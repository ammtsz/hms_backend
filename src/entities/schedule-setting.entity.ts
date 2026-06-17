import { Entity, PrimaryGeneratedColumn, Column, Check } from 'typeorm';

@Entity('hms_schedule_setting')
export class ScheduleSetting {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  @Check('day_of_week BETWEEN 0 AND 6')
  day_of_week: number;

  @Column({ type: 'time' })
  start_time: string;

  @Column({ type: 'time' })
  end_time: string;

  @Column({ default: 1 })
  max_concurrent_assessment: number;

  @Column({ default: 1 })
  max_concurrent_physiotherapy_tens: number;

  @Column({ default: true })
  is_active: boolean;

  // Timezone-agnostic created/updated date/time pairs
  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;
}
