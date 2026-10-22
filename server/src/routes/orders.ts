import { Router } from 'express';
import type { Request } from 'express';
import { requireRole } from '../auth';
import { db } from '../db';
import { createOrder, deleteOrder } from './orderWrite';

const STATUSES = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
const SORT_COLUMNS = { date: 'created_at', total: 'total_cents' } as const;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;

type SortColumn = (typeof SORT_COLUMNS)[keyof typeof SORT_COLUMNS];

interface Cursor {
  value: string | number;
  id: number;
}

interface ListParams {
  search: string;
  status?: string;
  column: SortColumn;
  direction: 'ASC' | 'DESC';
  limit: number;
  cursor?: Cursor;
  minTotal?: number;
}

interface OrderRow {
  id: number;
  customer_name: string;
  customer_email: string;
  status: string;
  total_cents: number;
  created_at: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

function decodeCursor(raw: string, column: SortColumn): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const expectedType = column === 'created_at' ? 'string' : 'number';
    if (!Number.isInteger(parsed.id) || typeof parsed.value !== expectedType) return null;
    return { value: parsed.value, id: parsed.id };
  } catch {
    return null;
  }
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}

function parseQuery(query: Request['query']): { params: ListParams } | { error: string } {
  for (const [name, value] of Object.entries(query)) {
    if (typeof value !== 'string') return { error: `${name} must be a single value` };
  }
  const { q = '', status, sort = 'date', dir = 'desc', limit, cursor, minTotal } = query as Record<string, string | undefined>;

  if (sort !== 'date' && sort !== 'total') return { error: 'sort must be date or total' };
  if (dir !== 'asc' && dir !== 'desc') return { error: 'dir must be asc or desc' };
  if (status !== undefined && !STATUSES.includes(status)) return { error: 'invalid status' };
  let parsedMinTotal: number | undefined;
  if (minTotal !== undefined) {
    parsedMinTotal = Number(minTotal);
    if (!Number.isInteger(parsedMinTotal) || parsedMinTotal < 0) {
      return { error: 'minTotal must be a non-negative integer' };
    }
  }
  const search = q.trim();
  if (search.length > MAX_SEARCH_LENGTH) return { error: 'q is too long' };

  const parsedLimit = limit === undefined ? DEFAULT_LIMIT : Number(limit);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
    return { error: `limit must be an integer between 1 and ${MAX_LIMIT}` };
  }

  const column = SORT_COLUMNS[sort];
  let decoded: Cursor | undefined;
  if (cursor !== undefined) {
    const result = decodeCursor(cursor, column);
    if (!result) return { error: 'invalid cursor' };
    decoded = result;
  }

  return {
    params: {
      search,
      status,
      column,
      direction: dir === 'asc' ? 'ASC' : 'DESC',
      limit: parsedLimit,
      cursor: decoded,
      minTotal: parsedMinTotal,
    },
  };
}

function buildQuery(params: ListParams): { sql: string; values: (string | number)[] } {
  const conditions: string[] = [];
  const values: (string | number)[] = [];

  if (params.search) {
    const pattern = `${escapeLike(params.search)}%`;
    conditions.push(`(customer_name LIKE ? ESCAPE '\\' OR customer_email LIKE ? ESCAPE '\\')`);
    values.push(pattern, pattern);
  }
  if (params.status) {
    conditions.push('status = ?');
    values.push(params.status);
  }
  if (params.minTotal !== undefined) {
    conditions.push('total_cents >= ?');
    values.push(params.minTotal);
  }
  if (params.cursor) {
    const comparison = params.direction === 'ASC' ? '>' : '<';
    conditions.push(`(${params.column}, id) ${comparison} (?, ?)`);
    values.push(params.cursor.value, params.cursor.id);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `
    SELECT id, customer_name, customer_email, status, total_cents, created_at
    FROM orders
    ${where}
    ORDER BY ${params.column} ${params.direction}, id ${params.direction}
    LIMIT ?`;
  values.push(params.limit + 1);

  return { sql, values };
}

export const ordersRouter = Router();

ordersRouter.get('/', (req, res) => {
  const parsed = parseQuery(req.query);
  if ('error' in parsed) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const { params } = parsed;

  const { sql, values } = buildQuery(params);
  const rows = db.prepare(sql).all(...values) as unknown as OrderRow[];

  const hasMore = rows.length > params.limit;
  const page = hasMore ? rows.slice(0, params.limit) : rows;
  const last = page[page.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ value: last[params.column], id: last.id }) : null;

  res.json({
    items: page.map((row) => ({
      id: row.id,
      customerName: row.customer_name,
      customerEmail: row.customer_email,
      status: row.status,
      totalCents: row.total_cents,
      createdAt: row.created_at,
    })),
    nextCursor,
  });
});

ordersRouter.post('/', createOrder);
ordersRouter.delete('/:id', requireRole('admin'), deleteOrder);
