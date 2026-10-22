import jwt from 'jsonwebtoken';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { loginAdmin, loginAgent } from './helpers';

const SECRET = process.env.JWT_SECRET as string;

describe('auth', () => {
  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(401);
  });

  it('ignores a token passed in the query string', async () => {
    const cookie = await loginAgent();
    const token = cookie.split('=')[1];
    const res = await request(app).get(`/api/orders?token=${token}`);
    expect(res.status).toBe(401);
  });

  it('rejects a token that is only decoded, not signed with our secret', async () => {
    const forged = jwt.sign({ sub: '1', role: 'admin' }, 'some-other-secret-value');
    const res = await request(app).get('/api/orders').set('Cookie', `token=${forged}`);
    expect(res.status).toBe(401);
  });

  it('rejects an unsigned (alg none) token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: '1', role: 'admin' })).toString('base64url');
    const res = await request(app).get('/api/orders').set('Cookie', `token=${header}.${body}.`);
    expect(res.status).toBe(401);
  });

  it('rejects an expired token', async () => {
    const expired = jwt.sign({ sub: '1', role: 'admin' }, SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/orders').set('Cookie', `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it('sets an httpOnly, SameSite=Strict cookie on login', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'agent@test.local', password: 'agent-pass' });
    expect(res.status).toBe(200);
    const cookie = (res.headers['set-cookie'] as unknown as string[])[0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(res.body.token).toBeUndefined();
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const wrongPassword = await request(app).post('/api/auth/login').send({ email: 'agent@test.local', password: 'nope' });
    const unknownEmail = await request(app).post('/api/auth/login').send({ email: 'ghost@test.local', password: 'nope' });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('checks the role on the server: agents cannot delete, admins can', async () => {
    const agent = await loginAgent();
    const admin = await loginAdmin();
    const asAgent = await request(app).delete('/api/orders/1').set('Cookie', agent);
    expect(asAgent.status).toBe(403);
    const asAdmin = await request(app).delete('/api/orders/999999').set('Cookie', admin);
    expect(asAdmin.status).toBe(404);
  });

  it('blocks login after too many failed attempts', async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: 'brute@test.local', password: `try-${i}` });
      last = res.status;
    }
    expect(last).toBe(429);
  });
});
