import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

const STAFF = [
  { email: 'admin@sarh.test', password: 'Admin123!', role: 'admin' },
  { email: 'agent@sarh.test', password: 'Agent123!', role: 'agent' },
];

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, '../data/orders.db');
const ORDERS = Number(process.argv[2]) || 50_000;
const USERS = Math.max(1, Math.floor(ORDERS / 6));
const PRODUCTS = 300;

faker.seed(2026);

const STATUSES = [
  { weight: 45, value: 'delivered' },
  { weight: 15, value: 'shipped' },
  { weight: 12, value: 'paid' },
  { weight: 13, value: 'pending' },
  { weight: 15, value: 'cancelled' },
];

const ITEM_COUNTS = [
  { weight: 35, value: 1 },
  { weight: 30, value: 2 },
  { weight: 20, value: 3 },
  { weight: 10, value: 4 },
  { weight: 5, value: 5 },
];

const products = Array.from({ length: PRODUCTS }, () => ({
  productName: faker.commerce.productName(),
  cents: faker.number.int({ min: 500, max: 50_000 }),
}));

const users = Array.from({ length: USERS }, (_, i) => {
  const first = faker.person.firstName();
  const last = faker.person.lastName();
  const handle = `${first}.${last}.${i}`.toLowerCase().replace(/[^a-z0-9.]/g, '');
  return {
    id: i + 1,
    name: `${first} ${last}`,
    email: `${handle}@example.com`,
    phone: `01${faker.helpers.arrayElement(['0', '1', '2', '5'])}${faker.string.numeric(8)}`,
  };
});

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(fs.readFileSync(path.resolve(__dirname, '../db/schema.sql'), 'utf8'));

const insertUser = db.prepare('INSERT INTO users (id, name, email, phone) VALUES (?, ?, ?, ?)');
const insertOrder = db.prepare(
  `INSERT INTO orders (id, user_id, customer_name, customer_email, status, total_cents, created_at, u_number)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);
const insertItem = db.prepare(
  'INSERT INTO order_items (id, order_id, product_name, price_cents, quantity) VALUES (?, ?, ?, ?, ?)',
);

const startedAt = Date.now();

db.exec('BEGIN');
try {
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM users; DELETE FROM staff;');
  for (const s of STAFF) {
    db.prepare('INSERT INTO staff (email, password_hash, role) VALUES (?, ?, ?)').run(s.email, hashPassword(s.password), s.role);
  }
  for (const u of users) insertUser.run(u.id, u.name, u.email, u.phone);

  let itemId = 1;
  for (let orderId = 1; orderId <= ORDERS; orderId++) {
    const user = faker.helpers.arrayElement(users);
    const status = faker.helpers.weightedArrayElement(STATUSES);
    const createdAt = faker.date.recent({ days: 365 }).toISOString();
    const lines = faker.helpers
      .arrayElements(products, faker.helpers.weightedArrayElement(ITEM_COUNTS))
      .map((product) => ({ product, quantity: faker.number.int({ min: 1, max: 4 }) }));
    const totalCents = lines.reduce((sum, l) => sum + l.product.cents * l.quantity, 0);

    insertOrder.run(orderId, user.id, user.name, user.email, status, totalCents, createdAt, faker.string.uuid());
    for (const l of lines) {
      insertItem.run(itemId++, orderId, l.product.productName, l.product.cents, l.quantity);
    }
  }
  db.exec('COMMIT');
} catch (err) {
  db.exec('ROLLBACK');
  throw err;
}

db.exec('ANALYZE');

const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
console.log({
  db: DB_PATH,
  users: count('users'),
  staff: count('staff'),
  orders: count('orders'),
  order_items: count('order_items'),
  seconds: (Date.now() - startedAt) / 1000,
});
console.table(
  db.prepare('SELECT status, COUNT(*) AS count FROM orders GROUP BY status ORDER BY count DESC').all(),
);

db.close();
