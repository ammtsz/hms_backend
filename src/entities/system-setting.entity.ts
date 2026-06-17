import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('hms_system_settings')
export class SystemSetting {
  @PrimaryColumn({ type: 'varchar', length: 100 })
  key: string;

  @Column({ type: 'varchar', length: 500 })
  value: string;
}
