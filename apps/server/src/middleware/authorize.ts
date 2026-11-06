import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifyAccessToken } from '../modules/auth/auth.service';
import { env } from '../config/env'; // adjust to your env module
import { AppError } from '../utils/apperror'

const Role = ['tenant','landlord','admin'];

// Role check: authorize('admin'), authorize('tenant', 'landlord')
export const authorize =
  (...allowed: any) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (!allowed.includes(req.user.role)) {
      return next(new AppError(403, 'You do not have permission to do this'));
    }
    return next();
  };

// Ownership check for routes like /users/:id. Only that user or an admin gets through.
export const selfOrAdmin =
  (param = 'id') =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Authentication required'));
    if (req.user.role === 'admin' || req.user.sub === req.params[param]) {
      return next();
    }
    return next(new AppError(403, 'You do not have permission to do this'));
  };