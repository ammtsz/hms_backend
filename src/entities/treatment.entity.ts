import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Check,
} from 'typeorm';
import { Patient } from './patient.entity';
import { Consultation } from './consultation.entity';
import { Appointment } from './appointment.entity';
import { Session } from './session.entity';

export enum TreatmentType {
  PHYSIOTHERAPY = 'physiotherapy',
  TENS = 'tens',
}

/**
 * Workflow status for a treatment row (`hms_treatment.status`).
 * PostgreSQL enum name: `TREATMENT_STATUS` (distinct from `SESSION_STATUS` on `hms_session`).
 */
export enum TreatmentPlanStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('hms_treatment')
@Check(`"planned_sessions" > 0 AND "planned_sessions" <= 50`)
@Check(
  `"duration_minutes" IS NULL OR ("duration_minutes" > 0 AND "duration_minutes" <= 70)`,
)
@Check(`
  (treatment_type = 'physiotherapy' AND duration_minutes IS NOT NULL AND color IS NOT NULL) OR
  (treatment_type = 'tens' AND duration_minutes IS NULL AND color IS NULL)
`)
export class Treatment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  consultation_id: number;

  @ManyToOne(() => Consultation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'consultation_id' })
  consultation: Consultation;

  @Column()
  appointment_id: number;

  @ManyToOne(() => Appointment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointment_id' })
  appointment: Appointment;

  @Column()
  patient_id: number;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patient_id' })
  patient: Patient;

  @Column({
    type: 'enum',
    enum: TreatmentType,
    enumName: 'TREATMENT_TYPE',
  })
  treatment_type: TreatmentType;

  @Column({ name: 'body_locations', type: 'text' })
  body_location: string;

  @Column({ type: 'date' })
  start_date: string;

  @Column({ type: 'integer' })
  planned_sessions: number;

  @Column({ type: 'integer', default: 0 })
  completed_sessions: number;

  @Column({ type: 'date', nullable: true })
  end_date: string;

  @Column({
    type: 'enum',
    enum: TreatmentPlanStatus,
    enumName: 'TREATMENT_STATUS',
    default: TreatmentPlanStatus.SCHEDULED,
  })
  status: TreatmentPlanStatus;

  @Column({ type: 'integer', nullable: true })
  duration_minutes: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  color: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  cancellation_reason: string;

  @OneToMany(() => Session, (session) => session.treatment)
  sessions: Session[];

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  updated_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  updated_time: string;
}
