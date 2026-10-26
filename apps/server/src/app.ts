import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { db } from './config/db';
import { sql } from 'drizzle-orm';

const app = express();

// ─── Global Middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Ping the database to confirm the connection is live
    await db.execute(sql`SELECT 1`);
    res.status(200).json({
      status: 'ok',
      message: 'HabiPay server is running',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      message: 'HabiPay server is running but database connection failed',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

// ─── API Routes ────────────────────────────────────────────────────────────────
// Routes will be registered here as modules are built
// e.g. app.use('/api/auth', authRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ status: 'error', message: 'Route not found' });
});

export default app;
