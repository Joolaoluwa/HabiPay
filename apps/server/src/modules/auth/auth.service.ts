import jwt from "jsonwebtoken";
import { env } from "../../config/env";

// ─── Token Payload ─────────────────────────────────────────────────────────────
// Shape of the data encoded inside every access token
export interface TokenPayload {
  sub: string;   // user UUID
  role: string;  // tenant | landlord | admin
  status: string;
}

// ─── Sign Access Token ─────────────────────────────────────────────────────────
export function signAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

// ─── Verify Access Token ───────────────────────────────────────────────────────
// Returns the decoded payload or throws if expired / invalid
export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
}
