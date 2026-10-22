import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config';

if (!fs.existsSync(config.dbPath)) {
  throw new Error(`Database not found at ${config.dbPath}. Run "npm run seed" first.`);
}

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
