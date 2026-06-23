import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Treatment } from './treatment.entity';
import { Appointment } from './appointment.entity';

/** Row status for `hms_session` (PostgreSQL `SESSION_STATUS`). */
export enum SessionAppointmentStatus {
  SCHEDULED = 'scheduled',
  COMPLETED = 'completed',
  MISSED = 'missed',
  CANCELLED = 'cancelled',
}

/** One scheduled occurrence in a treatment series (`hms_session`). */
@Entity('hms_session')
export class Session {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  treatment_id: number;

  @ManyToOne(() => Treatment, (treatment) => treatment.sessions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'treatment_id' })
  treatment: Treatment;

  @Column({ nullable: true })
  appointment_id: number;

  @ManyToOne(() => Appointment, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;

  @Column({ type: 'integer' })
  session_number: number;

  @Column({ type: 'varchar', length: 10 })
  scheduled_date: string;

  @Column({ type: 'time', nullable: true })
  start_time: string;

  @Column({ type: 'time', nullable: true })
  end_time: string;

  @Column({
    type: 'enum',
    enum: SessionAppointmentStatus,
    enumName: 'SESSION_STATUS',
    default: SessionAppointmentStatus.SCHEDULED,
  })
  status: SessionAppointmentStatus;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  missed_reason: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  performed_by: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;
}
