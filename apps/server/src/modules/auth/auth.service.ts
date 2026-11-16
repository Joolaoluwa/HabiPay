import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import crypto from "crypto";
import {db} from "../../config/db"
import { refreshTokens } from "../../db/schema/refresh-token";
import {eq, and, isNull} from "drizzle-orm"
import { AppError } from "../../utils/appresponse";

// ─── Token Payload ─────────────────────────────────────────────────────────────
// Shape of the data encoded inside every access token
export interface TokenPayload {
  id: string;   // user UUID
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

const hashToken = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export async function issueRefreshToken(userId: string, familyId: string = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString("hex"); // sent to the client
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: hashToken(token),
    familyId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return token;
}

export async function rotateRefreshToken(token: string) {
  const [row] = await db.select().from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token))).limit(1);

  if (!row) throw new AppError(401, "Invalid refresh token");

  if (row.revokedAt) {
    // reuse detected: kill the whole family
    await db.update(refreshTokens).set({ revokedAt: new Date() })
      .where(eq(refreshTokens.familyId, row.familyId));
    throw new AppError(401, "Refresh token reuse detected");
  }
  if (row.expiresAt < new Date()) throw new AppError(401, "Refresh token expired");

  await db.update(refreshTokens).set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, row.id));

  const newRefresh = await issueRefreshToken(row.userId, row.familyId);
  return { userId: row.userId, refreshToken: newRefresh };
}

export async function revokeRefreshTokenFamily(token: string) {
  const [row] = await db
    .select({ familyId: refreshTokens.familyId })
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, hashToken(token)))
    .limit(1);

  if (!row) return; // unknown token: nothing to revoke

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
}