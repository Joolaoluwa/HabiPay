import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { AppError } from '../utils/apperror';

const isProd = process.env.NODE_ENV === 'production';

const tooMany = (message: string) => (_req: Request, res: Response) =>
  new AppError(429, message);

// Whole API: generous
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Too many requests, please try again later'),
});

// signup, login, OTP, password reset: strict (looser outside production so you can test)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isProd ? 10 : 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: tooMany('Too many attempts, please try again in 15 minutes'),
});