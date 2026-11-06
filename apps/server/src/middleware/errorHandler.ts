import {Request, Response, NextFunction} from 'express'
import { AppError } from '../utils/apperror'

export function notFoundHandler(req: Request, next: NextFunction){
    return next(new AppError(404, `Route not found: {req.method} {req.OriginalUrl}`));
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  // Errors we threw on purpose are safe to show
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.code && { code: err.code }),
    });
  }

  // body-parser errors
  const type = (err as { type?: string })?.type;
  if (type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Malformed JSON body' });
  }
  if (type === 'entity.too.large') {
    return res.status(413).json({ message: 'Request body too large' });
  }

  const cause = (err as { cause?: Error })?.cause;
  console.error(
    `[${req.method} ${req.originalUrl}]`,
    cause ? `${(err as Error).name}: ${cause.message}` : err,
  );
  return res.status(500).json({ message: 'Internal server error' });
}