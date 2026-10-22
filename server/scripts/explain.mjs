import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
const db = new DatabaseSync(process.env.DB_PATH || path.resolve(__dirname, '../data/orders.db'));

const queries = {
  'newest first': 'SELECT id FROM orders ORDER BY created_at DESC, id DESC LIMIT 51',
  'next page (cursor)': "SELECT id FROM orders WHERE (created_at, id) < ('2026-06-01T00:00:00.000Z', 100) ORDER BY created_at DESC, id DESC LIMIT 51",
  'highest amount': 'SELECT id FROM orders ORDER BY total_cents DESC, id DESC LIMIT 51',
  'status filter + newest': "SELECT id FROM orders WHERE status = 'cancelled' ORDER BY created_at DESC, id DESC LIMIT 51",
  'search "ele"': "SELECT id FROM orders WHERE (customer_name LIKE 'ele%' ESCAPE '\\' OR customer_email LIKE 'ele%' ESCAPE '\\') ORDER BY created_at DESC, id DESC LIMIT 51",
};

for (const [label, sql] of Object.entries(queries)) {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all().map((r) => r.detail).join(' | ');
  console.log(`${label.padEnd(26)} ${plan}`);
}
