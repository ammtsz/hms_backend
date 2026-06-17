import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('hms_holiday')
export class Holiday {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date', unique: true })
  holiday_date: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'varchar', array: true, nullable: true, default: null })
  blocked_treatment_types: string[] | null;

  @Column({ type: 'uuid', nullable: true })
  holiday_group_id: string | null;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;
}
