import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { AppointmentType, AppointmentStatus } from '../common/enums';
import { Patient } from './patient.entity';
import { Consultation } from './consultation.entity';

@Entity('hms_appointment')
export class Appointment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patient_id: number;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({
    type: 'enum',
    enum: AppointmentType,
  })
  type: AppointmentType;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    default: AppointmentStatus.SCHEDULED,
  })
  status: AppointmentStatus;

  // Timezone-agnostic scheduled date/time
  @Column({ type: 'date' })
  scheduled_date: string; // Store as YYYY-MM-DD string

  @Column({ type: 'time' })
  scheduled_time: string; // Store as HH:MM:SS string

  // Timezone-agnostic event times (dates derived from context)
  @Column({ type: 'time', nullable: true })
  checked_in_time: string;

  @Column({ type: 'time', nullable: true })
  started_time: string;

  @Column({ type: 'time', nullable: true })
  completed_time: string;

  @Column({ type: 'date', nullable: true })
  cancelled_date: string;

  @Column({ type: 'time', nullable: true })
  cancelled_time: string;

  @Column({ type: 'boolean', nullable: true })
  absence_justified: boolean;

  @Column({ type: 'text', nullable: true })
  absence_notes: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  // Parent/child relationship for linking follow-up appointments and generated treatments
  @Column({ nullable: true })
  parent_appointment_id: number;

  // Reschedule: links this (new) appointment to the original cancelled/missed one. Unique per original.
  @Column({ nullable: true, unique: true })
  rescheduled_from_appointment_id: number;

  // Timezone-agnostic created/updated date/time pairs
  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;

  @OneToOne(() => Consultation, (consultation) => consultation.appointment)
  consultation: Consultation;
}
