import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginAgent, newOrderBody } from './helpers';

let cookie: string;

beforeAll(async () => {
  cookie = await loginAgent();
  const names = ['Eleanor Boehm', 'Elena Cruz', 'Bob Stone', '100%_Real'];
  for (const [i, name] of names.entries()) {
    await request(app)
      .post('/api/orders')
      .set('Cookie', cookie)
      .send(
        newOrderBody({
          customer: { name, email: `list${i}@example.com`, phone: '01012345678' },
          items: [{ productName: 'Thing', priceCents: (i + 1) * 100000, quantity: 1 }],
        }),
      );
  }
});

const get = (qs: string) => request(app).get(`/api/orders${qs}`).set('Cookie', cookie);

describe('list orders (R1)', () => {
  it('searches by the start of the name', async () => {
    const res = await get('?q=ele');
    expect(res.status).toBe(200);
    expect(res.body.items.map((o: { customerName: string }) => o.customerName).sort()).toEqual(['Elena Cruz', 'Eleanor Boehm'].sort());
  });

  it('does not treat % and _ as wildcards', async () => {
    const res = await get('?q=' + encodeURIComponent('100%_'));
    expect(res.body.items).toHaveLength(1);
    const wildcard = await get('?q=' + encodeURIComponent('%'));
    expect(wildcard.body.items).toHaveLength(0);
  });

  it('sorts by total and pages with the cursor without repeats', async () => {
    const first = await get('?sort=total&dir=desc&limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).not.toBeNull();
    const second = await get(`?sort=total&dir=desc&limit=2&cursor=${first.body.nextCursor}`);
    const ids = [...first.body.items, ...second.body.items].map((o: { id: number }) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const totals = [...first.body.items, ...second.body.items].map((o: { totalCents: number }) => o.totalCents);
    expect(totals).toEqual([...totals].sort((a, b) => b - a));
  });

  it('filters by minTotal', async () => {
    const res = await get('?minTotal=300000');
    expect(res.status).toBe(200);
    for (const item of res.body.items) expect(item.totalCents).toBeGreaterThanOrEqual(300000);
  });

  it.each([
    ['sort=price'],
    ['dir=up'],
    ['status=lost'],
    ['limit=0'],
    ['limit=1000'],
    ['cursor=garbage'],
    ['minTotal=abc'],
    ['minTotal=-5'],
    ['status=paid&status=shipped'],
  ])('rejects bad query: %s', async (qs) => {
    const res = await get(`?${qs}`);
    expect(res.status).toBe(400);
  });
});
