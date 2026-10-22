import { Router } from 'express';
import { COOKIE_NAME, requireAuth, signToken } from '../auth';
import type { AuthUser, Role } from '../auth';
import { config } from '../config';
import { db } from '../db';
import { hashPasswordSync, verifyPassword } from '../lib/password';

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const DUMMY_HASH = hashPasswordSync('not-a-real-password');

const failures = new Map<string, { count: number; resetAt: number }>();

function isBlocked(key: string): boolean {
  const entry = failures.get(key);
  if (!entry) return false;
  if (entry.resetAt < Date.now()) {
    failures.delete(key);
    return false;
  }
  return entry.count >= MAX_FAILED_ATTEMPTS;
}

function recordFailure(key: string): void {
  const entry = failures.get(key);
  if (!entry || entry.resetAt < Date.now()) {
    failures.set(key, { count: 1, resetAt: Date.now() + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

interface StaffRow {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
}

export const authRouter = Router();

authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const key = `${req.ip}|${email.toLowerCase()}`;
  if (isBlocked(key)) {
    res.status(429).json({ error: 'too many attempts, try again later' });
    return;
  }

  const staff = db
    .prepare('SELECT id, email, password_hash, role FROM staff WHERE email = ?')
    .get(email.toLowerCase()) as StaffRow | undefined;

  const ok = await verifyPassword(password, staff?.password_hash ?? DUMMY_HASH);
  if (!staff || !ok) {
    recordFailure(key);
    res.status(401).json({ error: 'wrong email or password' });
    return;
  }

  failures.delete(key);
  const user: AuthUser = { id: staff.id, role: staff.role };
  res.cookie(COOKIE_NAME, signToken(user), {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProduction,
    maxAge: config.tokenTtlSeconds * 1000,
  });
  res.json({ user: { email: staff.email, role: staff.role } });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'strict', secure: config.isProduction });
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (_req, res) => {
  const { id } = res.locals.user as AuthUser;
  const staff = db.prepare('SELECT email, role FROM staff WHERE id = ?').get(id) as
    | { email: string; role: Role }
    | undefined;
  if (!staff) {
    res.status(401).json({ error: 'user no longer exists' });
    return;
  }
  res.json({ user: { email: staff.email, role: staff.role } });
});
