import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  throw new Error('JWT_SECRET is missing or too short. Copy .env.example to .env and set it (16+ characters).');
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.resolve(__dirname, '../data/orders.db'),
  jwtSecret,
  tokenTtlSeconds: 60 * 60,
  isProduction: process.env.NODE_ENV === 'production',
};
