import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "../modules/auth/auth.service";

export function authenticate(req: Request, res: Response, next: NextFunction) {
  // 1. Extract token from Authorization header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Access token missing. Please log in.",
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      message: "Access token missing. Please log in.",
    });
  }

  try {
    // 2. Verify token — throws if expired or tampered
    const payload = verifyAccessToken(token);

    // 3. Attach decoded payload to req.user for downstream use
    req.user = payload;

    return next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        message: "Your session has expired. Please log in again.",
      });
    }

    if (err instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        message: "Invalid access token.",
      });
    }

    return next(err);
  }
}
