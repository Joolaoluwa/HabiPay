import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { transporter } from '../config/mailer';
import { env } from '../config/env';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const BCRYPT_COST = 10; // lower than password cost — OTPs are short-lived

// ─── Generate OTP ──────────────────────────────────────────────────────────────
// Returns a cryptographically random 6-digit numeric OTP
export function generateOtp(): string {
  const otp = crypto.randomInt(0, 10 ** OTP_LENGTH);
  // Zero-pad to ensure it is always OTP_LENGTH digits e.g. 004521
  return otp.toString().padStart(OTP_LENGTH, '0');
}

// ─── Hash OTP ──────────────────────────────────────────────────────────────────
// Hashes the OTP before storing in the DB — never store plaintext OTPs
export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_COST);
}

// ─── Verify OTP ────────────────────────────────────────────────────────────────
// Compares the user-provided OTP against the stored hash
export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// ─── OTP Expiry ────────────────────────────────────────────────────────────────
// Returns a Date object representing when the OTP expires
export function getOtpExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + OTP_EXPIRY_MINUTES);
  return expiry;
}

// ─── Send OTP Email ────────────────────────────────────────────────────────────
// Sends the OTP to the user's email via Gmail SMTP 
// Called immediately after signup — no HTTP endpoint needed
export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otp: string
): Promise<void> {
  await transporter.sendMail({
    from: `"HabiPay" <${env.GMAIL_USER}>`,
    to: recipientEmail,
    subject: 'Verify your HabiPay account',
    text: `Hi ${recipientName},\n\nYour verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you did not create a HabiPay account, ignore this email.\n\nThe HabiPay Team`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto;">
        <h2 style="color: #1a1a2e;">Verify your HabiPay account</h2>
        <p>Hi <strong>${recipientName}</strong>,</p>
        <p>Enter the code below to verify your email address:</p>
        <div style="
          font-size: 36px;
          font-weight: bold;
          letter-spacing: 8px;
          text-align: center;
          padding: 24px;
          background: #f4f4f4;
          border-radius: 8px;
          margin: 24px 0;
          color: #1a1a2e;
        ">
          ${otp}
        </div>
        <p style="color: #666;">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
        <p style="color: #666;">If you did not create a HabiPay account, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
        <p style="color: #999; font-size: 12px;">The HabiPay Team</p>
      </div>
    `,
  });
}
