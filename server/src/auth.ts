import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';

export type Role = 'admin' | 'agent';
export interface AuthUser {
  id: number;
  role: Role;
}

export const COOKIE_NAME = 'token';

function isRole(value: unknown): value is Role {
  return value === 'admin' || value === 'agent';
}

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return undefined;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: config.tokenTtlSeconds,
  });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = readCookie(req.headers.cookie, COOKIE_NAME);
  if (!token) {
    res.status(401).json({ error: 'not signed in' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || !isRole(payload.role) || !payload.sub) {
      res.status(401).json({ error: 'invalid token' });
      return;
    }
    res.locals.user = { id: Number(payload.sub), role: payload.role } satisfies AuthUser;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

export function requireRole(role: Role) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    const user = res.locals.user as AuthUser | undefined;
    if (user?.role !== role) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    next();
  };
}
