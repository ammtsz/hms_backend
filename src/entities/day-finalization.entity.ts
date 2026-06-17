import { Entity, Column, PrimaryColumn } from 'typeorm';

/**
 * DayFinalization Entity
 * Tracks which dates have been finalized (end-of-day process completed)
 *
 * A finalized day means:
 * - All scheduled absences have been marked as MISSED with justifications
 * - Patient streaks have been updated
 * - Day is locked from further editing
 */
@Entity('hms_day_finalization')
export class DayFinalization {
  @PrimaryColumn({ type: 'date' })
  finalization_date: string; // YYYY-MM-DD format

  @Column({ type: 'timestamp' })
  finalized_at: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  finalized_by?: string; // Future: track user who finalized

  @Column({ type: 'text', nullable: true })
  notes?: string; // Optional notes about finalization

  @Column({ type: 'date', default: () => 'CURRENT_DATE' })
  created_date: string;

  @Column({ type: 'time', default: () => 'CURRENT_TIME' })
  created_time: string;
}
