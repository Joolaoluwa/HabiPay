import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import { db } from "../../config/db";
import { users } from "../../db/schema/users";
import { otps } from "../../db/schema/otps";
import type {
  SignupInput,
  LoginInput,
  VerifyOtpInput,
  ResendOtpInput,
  ForgotPasswordInput,
  ResetPasswordInput,
} from "./auth.types";
import { eq, and, isNull } from "drizzle-orm";
import { signAccessToken } from "./auth.service";
import {
  generateOtp,
  hashOtp,
  verifyOtp,
  getOtpExpiry,
  sendOtpEmail,
} from "../../utils/otp";

const BCRYPT_COST = 12;
const MAX_OTP_ATTEMPTS = 5;

// Postgres unique_violation
function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === "23505" || e?.cause?.code === "23505";
}

// ─── Signup ───────────────────────────────────────────────────────────────────
export async function signup(req: Request, res: Response, next: NextFunction) {
  try {
    const { full_name, email, phone_number, password, role } =
      req.body as SignupInput;

    const password_hash = await bcrypt.hash(password, BCRYPT_COST);

    // 1. Create user — status stays pending until OTP is verified
    const [user] = await db
      .insert(users)
      .values({ full_name, email, phone_number, password_hash, role, status: "pending" })
      .returning({
        id: users.id,
        full_name: users.full_name,
        email: users.email,
        phone_number: users.phone_number,
        role: users.role,
        status: users.status,
      });

    if (!user) {
      return next(new Error("User creation failed unexpectedly."));
    }

    // 2. Generate OTP, hash it, store in otps table
    const otp = generateOtp();
    const code_hash = await hashOtp(otp);

    await db.insert(otps).values({
      user_id: user.id,
      code_hash,
      purpose: "email_verification",
      expires_at: getOtpExpiry(),
    });

    // 3. Send OTP email — fire and forget, don't block the response
    sendOtpEmail(user.email, user.full_name, otp).catch((err) => {
      console.error("Failed to send OTP email:", err);
    });

    return res.status(201).json({
      message: "Account created. Check your email for a verification code.",
      user,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return res.status(409).json({
        message: "An account with this email or phone number already exists",
      });
    }
    return next(err);
  }
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────
export async function verifyOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, otp } = req.body as VerifyOtpInput;

    // 1. Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (user.status === "active") {
      return res.status(400).json({ message: "Account is already verified." });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Your account has been suspended. Contact support.",
      });
    }

    // 2. Find the latest unused email_verification OTP for this user
    const [otpRecord] = await db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.user_id, user.id),
          eq(otps.purpose, "email_verification")
        )
      )
      .orderBy(otps.created_at)
      .limit(1);

    if (!otpRecord) {
      return res.status(400).json({
        message: "No verification code found. Please request a new one.",
      });
    }

    // 3. Check if already used
    if (otpRecord.used_at !== null) {
      return res.status(400).json({
        message: "This code has already been used. Please request a new one.",
      });
    }

    // 4. Check expiry
    if (new Date() > otpRecord.expires_at) {
      return res.status(400).json({
        message: "Your verification code has expired. Please request a new one.",
      });
    }

    // 5. Check brute-force attempts
    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        message: "Too many failed attempts. Please request a new code.",
      });
    }

    // 6. Verify the code using existing utility
    const isValid = await verifyOtp(otp, otpRecord.code_hash);

    if (!isValid) {
      // Increment attempts on failure
      await db
        .update(otps)
        .set({ attempts: otpRecord.attempts + 1 })
        .where(eq(otps.id, otpRecord.id));

      return res.status(400).json({ message: "Invalid verification code." });
    }

    // 7. Mark OTP as used and activate the user — both in one transaction
    await db.transaction(async (tx) => {
      await tx
        .update(otps)
        .set({ used_at: new Date() })
        .where(eq(otps.id, otpRecord.id));

      await tx
        .update(users)
        .set({ status: "active", updated_at: new Date() })
        .where(eq(users.id, user.id));
    });

    return res.status(200).json({
      message: "Email verified successfully. You can now log in.",
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body as LoginInput;

    // 1. Find user by email
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 2. Check account status before allowing login
    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Your account has been suspended. Contact support.",
      });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        message: "Please verify your email before logging in.",
      });
    }

    // 3. Compare password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // 4. Issue access token via service
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      status: user.status,
    });

    // 5. Return token and safe user object — no password_hash ever leaves the server
    return res.status(200).json({
      message: "Login successful",
      accessToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone_number: user.phone_number,
        role: user.role,
        status: user.status,
      },
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Resend OTP ───────────────────────────────────────────────────────────────
export async function resendOtpHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, purpose } = req.body as ResendOtpInput;

    // 1. Find user
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (user.status === "suspended") {
      return res.status(403).json({
        message: "Your account has been suspended. Contact support.",
      });
    }

    // For email_verification, only pending users need a resend
    if (purpose === "email_verification" && user.status === "active") {
      return res.status(400).json({ message: "Account is already verified." });
    }

    // For password_reset, only active users can reset
    if (purpose === "password_reset" && user.status === "pending") {
      return res.status(400).json({
        message: "Please verify your email before resetting your password.",
      });
    }

    // 2. Invalidate all previous unused OTPs of the same purpose
    // Sets used_at to now so they fail the used_at check on verification
    await db
      .update(otps)
      .set({ used_at: new Date() })
      .where(
        and(
          eq(otps.user_id, user.id),
          eq(otps.purpose, purpose),
          isNull(otps.used_at)
        )
      );

    // 3. Generate fresh OTP and store it — reusing existing utilities
    const otp = generateOtp();
    const code_hash = await hashOtp(otp);

    await db.insert(otps).values({
      user_id: user.id,
      code_hash,
      purpose,
      expires_at: getOtpExpiry(),
    });

    // 4. Send email — fire and forget
    sendOtpEmail(user.email, user.full_name, otp).catch((err) => {
      console.error("Failed to resend OTP email:", err);
    });

    return res.status(200).json({
      message: "A new verification code has been sent to your email.",
    });
  } catch (err) {
    return next(err);
  }
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
export async function forgotPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email } = req.body as ForgotPasswordInput;

    // 1. Find active user — deliberately vague response whether found or not
    // Prevents email enumeration attacks
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.status, "active")))
      .limit(1);

    // Always return the same response regardless of whether user exists
    const genericResponse = {
      message:
        "If an account with that email exists, a reset code has been sent.",
    };

    if (!user) {
      return res.status(200).json(genericResponse);
    }

    // 2. Invalidate previous unused password_reset OTPs
    await db
      .update(otps)
      .set({ used_at: new Date() })
      .where(
        and(
          eq(otps.user_id, user.id),
          eq(otps.purpose, "password_reset"),
          isNull(otps.used_at)
        )
      );

    // 3. Generate and store fresh OTP — reusing existing utilities
    const otp = generateOtp();
    const code_hash = await hashOtp(otp);

    await db.insert(otps).values({
      user_id: user.id,
      code_hash,
      purpose: "password_reset",
      expires_at: getOtpExpiry(),
    });

    // 4. Send email — fire and forget
    sendOtpEmail(user.email, user.full_name, otp).catch((err) => {
      console.error("Failed to send password reset OTP email:", err);
    });

    return res.status(200).json(genericResponse);
  } catch (err) {
    return next(err);
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────
export async function resetPasswordHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { email, otp, new_password } = req.body as ResetPasswordInput;

    // 1. Find active user
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email), eq(users.status, "active")))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: "Account not found." });
    }

    // 2. Find latest unused password_reset OTP
    const [otpRecord] = await db
      .select()
      .from(otps)
      .where(
        and(
          eq(otps.user_id, user.id),
          eq(otps.purpose, "password_reset")
        )
      )
      .orderBy(otps.created_at)
      .limit(1);

    if (!otpRecord) {
      return res.status(400).json({
        message: "No reset code found. Please request a new one.",
      });
    }

    if (otpRecord.used_at !== null) {
      return res.status(400).json({
        message: "This code has already been used. Please request a new one.",
      });
    }

    if (new Date() > otpRecord.expires_at) {
      return res.status(400).json({
        message: "Your reset code has expired. Please request a new one.",
      });
    }

    if (otpRecord.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({
        message: "Too many failed attempts. Please request a new code.",
      });
    }

    // 3. Verify OTP — reusing existing utility
    const isValid = await verifyOtp(otp, otpRecord.code_hash);

    if (!isValid) {
      await db
        .update(otps)
        .set({ attempts: otpRecord.attempts + 1 })
        .where(eq(otps.id, otpRecord.id));

      return res.status(400).json({ message: "Invalid reset code." });
    }

    // 4. Hash new password and save — mark OTP as used in one transaction
    const password_hash = await bcrypt.hash(new_password, BCRYPT_COST);

    await db.transaction(async (tx) => {
      await tx
        .update(otps)
        .set({ used_at: new Date() })
        .where(eq(otps.id, otpRecord.id));

      await tx
        .update(users)
        .set({ password_hash, updated_at: new Date() })
        .where(eq(users.id, user.id));
    });

    return res.status(200).json({
      message: "Password reset successfully. You can now log in.",
    });
  } catch (err) {
    return next(err);
  }
}
