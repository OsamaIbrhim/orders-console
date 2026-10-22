import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginAgent, newOrderBody } from './helpers';

const dbPath = process.env.DB_PATH as string;

function countByKey(uNumber: string): number {
  const db = new DatabaseSync(dbPath);
  const row = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE u_number = ?').get(uNumber) as { n: number };
  db.close();
  return row.n;
}

describe('create order (R2)', () => {
  it('creates one order and computes the total on the server', async () => {
    const cookie = await loginAgent();
    const body = newOrderBody({ totalCents: 1 });
    const res = await request(app).post('/api/orders').set('Cookie', cookie).send(body);
    expect(res.status).toBe(201);
    expect(res.body.duplicate).toBe(false);
    expect(res.body.order.totalCents).toBe(2500 * 2 + 1000);
  });

  it('two identical requests fired in parallel produce exactly one order', async () => {
    const cookie = await loginAgent();
    const body = newOrderBody();
    const [a, b] = await Promise.all([
      request(app).post('/api/orders').set('Cookie', cookie).send(body),
      request(app).post('/api/orders').set('Cookie', cookie).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 201]);
    expect(a.body.order.id).toBe(b.body.order.id);
    expect(countByKey(body.uNumber)).toBe(1);
  });

  it('twenty identical requests in parallel still produce exactly one order', async () => {
    const cookie = await loginAgent();
    const body = newOrderBody();
    const results = await Promise.all(
      Array.from({ length: 20 }, () => request(app).post('/api/orders').set('Cookie', cookie).send(body)),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(new Set(results.map((r) => r.body.order.id)).size).toBe(1);
    expect(countByKey(body.uNumber)).toBe(1);
  });

  it('the database itself refuses a duplicate key, even from another connection', () => {
    const db = new DatabaseSync(dbPath);
    const key = randomUUID();
    db.exec('PRAGMA foreign_keys = ON');
    db.prepare("INSERT INTO users (name, email, phone) VALUES ('X', ?, '0100000000')").run(`${key}@example.com`);
    const userId = (db.prepare('SELECT id FROM users WHERE email = ?').get(`${key}@example.com`) as { id: number }).id;
    const insert = () =>
      db
        .prepare("INSERT INTO orders (user_id, customer_name, customer_email, status, total_cents, created_at, u_number) VALUES (?, 'X', 'x@x.com', 'pending', 100, '2026-01-01T00:00:00.000Z', ?)")
        .run(userId, key);
    insert();
    expect(insert).toThrow(/UNIQUE/);
    db.close();
  });

  it('a different key makes a different order (known limit, see DECISIONS.md)', async () => {
    const cookie = await loginAgent();
    const first = newOrderBody();
    const second = { ...first, uNumber: randomUUID() };
    const a = await request(app).post('/api/orders').set('Cookie', cookie).send(first);
    const b = await request(app).post('/api/orders').set('Cookie', cookie).send(second);
    expect(a.body.order.id).not.toBe(b.body.order.id);
  });

  it.each([
    ['missing uNumber', { uNumber: undefined }],
    ['bad uNumber', { uNumber: 'abc' }],
    ['empty items', { items: [] }],
    ['negative price', { items: [{ productName: 'A', priceCents: -5, quantity: 1 }] }],
    ['zero quantity', { items: [{ productName: 'A', priceCents: 5, quantity: 0 }] }],
    ['fractional quantity', { items: [{ productName: 'A', priceCents: 5, quantity: 1.5 }] }],
    ['bad email', { customer: { name: 'A', email: 'nope', phone: '0100000000' } }],
    ['empty name', { customer: { name: ' ', email: 'a@b.com', phone: '0100000000' } }],
  ])('rejects invalid input: %s', async (_label, overrides) => {
    const cookie = await loginAgent();
    const res = await request(app).post('/api/orders').set('Cookie', cookie).send(newOrderBody(overrides));
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON with 400', async () => {
    const cookie = await loginAgent();
    const res = await request(app)
      .post('/api/orders')
      .set('Cookie', cookie)
      .set('Content-Type', 'application/json')
      .send('{"oops"');
    expect(res.status).toBe(400);
  });

  it('requires a signed-in user', async () => {
    const res = await request(app).post('/api/orders').send(newOrderBody());
    expect(res.status).toBe(401);
  });
});
