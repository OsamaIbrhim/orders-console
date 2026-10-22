import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { hashPasswordSync } from '../src/lib/password';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-test-'));
const dbPath = path.join(dir, 'test.db');

process.env.DB_PATH = dbPath;
process.env.JWT_SECRET = 'test-secret-test-secret';

const db = new DatabaseSync(dbPath);
db.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));
const insertStaff = db.prepare('INSERT INTO staff (email, password_hash, role) VALUES (?, ?, ?)');
insertStaff.run('admin@test.local', hashPasswordSync('admin-pass'), 'admin');
insertStaff.run('agent@test.local', hashPasswordSync('agent-pass'), 'agent');
db.close();
