import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "../../config/db";
import { users } from "../../db/schema/users";
import type { SignupInput } from "./auth.types";

const BCRYPT_COST = 12;

// Postgres unique_violation (newer drizzle versions wrap the driver error)
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const { full_name, email, phone_number, password, role } =
      req.body as SignupInput;

    const password_hash = await bcrypt.hash(password, BCRYPT_COST);

    const [user] = await db
      .insert(users)
      .values({
        full_name,
        email,
        phone_number,
        password_hash,
        role,
        status: "pending", // becomes active after POST /auth/verify-otp
      })
      .returning({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        phone_number: users.phone_number,
        role: users.role,
        status: users.status,
      });

    return res.status(201).json({ user });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        message: "An account with this email or phone number already exists",
      });
    }
    return next(err);
  }
}
