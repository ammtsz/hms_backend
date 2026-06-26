import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum SystemOptionType {
  BODY_LOCATION = 'body_location',
  PRIORITY = 'priority',
  NOTE_CATEGORY = 'note_category',
}

@Entity('hms_system_options')
export class SystemOption {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: SystemOptionType,
  })
  type: SystemOptionType;

  @Column({ length: 50 })
  value: string;

  @Column({ length: 50, nullable: true })
  label: string | null;

  @Column({ name: 'sort_order', type: 'integer', nullable: true })
  sortOrder: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
