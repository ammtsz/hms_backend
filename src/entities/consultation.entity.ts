import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  Check,
} from 'typeorm';
import { Attendance } from './attendance.entity';

@Entity('hms_consultation')
@Check(`"return_weeks" >= 0 AND "return_weeks" <= 52`)
export class Consultation {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  attendance_id: number;

  @OneToOne(() => Attendance, (attendance) => attendance.consultation, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'attendance_id' })
  attendance: Attendance;

  @Column({ type: 'text', nullable: true })
  main_complaint: string;

  @Column({ type: 'varchar', length: 1, nullable: true })
  patient_status: string;

  @Column({ type: 'text', nullable: true })
  food: string;

  @Column({ type: 'text', nullable: true })
  water: string;

  @Column({ type: 'text', nullable: true })
  ointments: string;

  @Column({ default: false })
  physiotherapy: boolean;

  @Column({ default: false })
  tens: boolean;

  @Column({ type: 'integer', nullable: true })
  return_weeks: number;

  @Column({ type: 'boolean', default: false })
  return_when_treatment_complete: boolean;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'time', nullable: true })
  start_time: string;

  @Column({ type: 'time', nullable: true })
  end_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;
}
