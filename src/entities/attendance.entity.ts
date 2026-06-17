import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { AttendanceType, AttendanceStatus } from '../common/enums';
import { Patient } from './patient.entity';
import { Consultation } from './consultation.entity';

@Entity('hms_attendance')
export class Attendance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  patient_id: number;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({
    type: 'enum',
    enum: AttendanceType,
  })
  type: AttendanceType;

  @Column({
    type: 'enum',
    enum: AttendanceStatus,
    default: AttendanceStatus.SCHEDULED,
  })
  status: AttendanceStatus;

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

  // Parent/child relationship for linking follow-up attendances and generated treatments
  @Column({ nullable: true })
  parent_attendance_id: number;

  // Reschedule: links this (new) attendance to the original cancelled/missed one. Unique per original.
  @Column({ nullable: true, unique: true })
  rescheduled_from_attendance_id: number;

  @Column({ nullable: true })
  timezone_override?: string;

  // Timezone-agnostic created/updated date/time pairs
  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;

  @OneToOne(() => Consultation, (consultation) => consultation.attendance)
  consultation: Consultation;
}
