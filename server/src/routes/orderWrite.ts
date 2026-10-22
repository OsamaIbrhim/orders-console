import type { Request, Response } from 'express';
import { db } from '../db';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ITEMS = 20;
const MAX_QUANTITY = 99;
const MAX_PRICE_CENTS = 10_000_000;

interface NewItem {
  productName: string;
  priceCents: number;
  quantity: number;
}

interface NewOrder {
  uNumber: string;
  name: string;
  email: string;
  phone: string;
  items: NewItem[];
}

interface OrderRow {
  id: number;
  customer_name: string;
  customer_email: string;
  status: string;
  total_cents: number;
  created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateNewOrder(body: unknown): { order: NewOrder } | { error: string } {
  if (!isRecord(body)) return { error: 'body must be a JSON object' };
  const { uNumber, customer, items } = body;

  if (typeof uNumber !== 'string' || !UUID.test(uNumber)) return { error: 'uNumber must be a UUID' };
  if (!isRecord(customer)) return { error: 'customer is required' };

  const name = typeof customer.name === 'string' ? customer.name.trim() : '';
  const email = typeof customer.email === 'string' ? customer.email.trim().toLowerCase() : '';
  const phone = typeof customer.phone === 'string' ? customer.phone.trim() : '';
  if (name.length < 1 || name.length > 100) return { error: 'customer name must be 1 to 100 characters' };
  if (email.length > 254 || !EMAIL.test(email)) return { error: 'customer email is not valid' };
  if (phone.length < 6 || phone.length > 20) return { error: 'customer phone must be 6 to 20 characters' };

  if (!Array.isArray(items) || items.length < 1 || items.length > MAX_ITEMS) {
    return { error: `items must have 1 to ${MAX_ITEMS} lines` };
  }
  const cleanItems: NewItem[] = [];
  for (const item of items) {
    if (!isRecord(item)) return { error: 'each item must be an object' };
    const productName = typeof item.productName === 'string' ? item.productName.trim() : '';
    const { priceCents, quantity } = item;
    if (productName.length < 1 || productName.length > 200) return { error: 'product name must be 1 to 200 characters' };
    if (!Number.isInteger(priceCents) || (priceCents as number) < 1 || (priceCents as number) > MAX_PRICE_CENTS) {
      return { error: 'priceCents must be a positive integer' };
    }
    if (!Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > MAX_QUANTITY) {
      return { error: `quantity must be an integer between 1 and ${MAX_QUANTITY}` };
    }
    cleanItems.push({ productName, priceCents: priceCents as number, quantity: quantity as number });
  }

  return { order: { uNumber, name, email, phone, items: cleanItems } };
}

function toApi(row: OrderRow) {
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    status: row.status,
    totalCents: row.total_cents,
    createdAt: row.created_at,
  };
}

const insertUser = db.prepare('INSERT INTO users (name, email, phone) VALUES (?, ?, ?) ON CONFLICT(email) DO NOTHING');
const findUser = db.prepare('SELECT id, name FROM users WHERE email = ?');
const insertOrder = db.prepare(
  `INSERT INTO orders (user_id, customer_name, customer_email, status, total_cents, created_at, u_number)
   VALUES (?, ?, ?, 'pending', ?, ?, ?)
   ON CONFLICT(u_number) DO NOTHING`,
);
const findOrderByKey = db.prepare(
  'SELECT id, customer_name, customer_email, status, total_cents, created_at FROM orders WHERE u_number = ?',
);
const insertItem = db.prepare(
  'INSERT INTO order_items (order_id, product_name, price_cents, quantity) VALUES (?, ?, ?, ?)',
);

export function createOrder(req: Request, res: Response): void {
  const parsed = validateNewOrder(req.body);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { order } = parsed;
  const totalCents = order.items.reduce((sum, item) => sum + item.priceCents * item.quantity, 0);

  db.exec('BEGIN IMMEDIATE');
  try {
    insertUser.run(order.name, order.email, order.phone);
    const user = findUser.get(order.email) as { id: number; name: string };

    const result = insertOrder.run(
      user.id,
      order.name,
      order.email,
      totalCents,
      new Date().toISOString(),
      order.uNumber,
    );

    if (result.changes === 0) {
      const existing = findOrderByKey.get(order.uNumber) as unknown as OrderRow;
      db.exec('COMMIT');
      res.status(200).json({ order: toApi(existing), duplicate: true });
      return;
    }

    const orderId = Number(result.lastInsertRowid);
    for (const item of order.items) {
      insertItem.run(orderId, item.productName, item.priceCents, item.quantity);
    }
    const created = findOrderByKey.get(order.uNumber) as unknown as OrderRow;
    db.exec('COMMIT');
    res.status(201).json({ order: toApi(created), duplicate: false });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function deleteOrder(req: Request, res: Response): void {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM order_items WHERE order_id = ?').run(id);
    const result = db.prepare('DELETE FROM orders WHERE id = ?').run(id);
    db.exec('COMMIT');
    if (result.changes === 0) {
      res.status(404).json({ error: 'order not found' });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
