import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app } from '../src/app';

export async function login(email: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return (res.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
}

export const loginAdmin = () => login('admin@test.local', 'admin-pass');
export const loginAgent = () => login('agent@test.local', 'agent-pass');

export function newOrderBody(overrides: Record<string, unknown> = {}) {
  return {
    uNumber: randomUUID(),
    customer: { name: 'Test Customer', email: `c-${randomUUID()}@example.com`, phone: '01012345678' },
    items: [
      { productName: 'Keyboard', priceCents: 2500, quantity: 2 },
      { productName: 'Mouse', priceCents: 1000, quantity: 1 },
    ],
    ...overrides,
  };
}
