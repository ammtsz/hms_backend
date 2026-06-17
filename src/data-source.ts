import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { config } from 'dotenv';

// Load environment variables
config();

const configService = new ConfigService();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: configService.get('POSTGRES_HOST') || 'localhost',
  port: parseInt(configService.get('POSTGRES_PORT') || '5432'),
  username: configService.get('POSTGRES_USER') || 'postgres',
  password: configService.get('POSTGRES_PASSWORD') || 'postgres',
  database: configService.get('POSTGRES_DB') || 'hms_db',
  entities: [__dirname + '/entities/*.entity{.ts,.js}'],
  synchronize: false, // Schema managed via init.sql
  logging: true,
});
