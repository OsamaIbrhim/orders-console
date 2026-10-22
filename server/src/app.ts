import express from 'express';
import type { ErrorRequestHandler } from 'express';
import { requireAuth } from './auth';
import { authRouter } from './routes/auth';
import { ordersRouter } from './routes/orders';

export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});
app.use('/api/auth', authRouter);
app.use('/api/orders', requireAuth, ordersRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err?.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'invalid JSON' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'internal error' });
};
app.use(errorHandler);
