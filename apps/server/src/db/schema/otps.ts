import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Table ────────────────────────────────────────────────────────────────────

export const otps = pgTable('otps', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relationship — one user can have multiple OTP records (one per purpose)
  // CASCADE: when a user is deleted, all their OTP records are removed too
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  // Hashed OTP — raw code is never stored (bcrypt via utils/otp.ts)
  code_hash: text('code_hash').notNull(),

  // Purpose — drives which flow this OTP belongs to
  // "email_verification" | "password_reset"
  purpose: text('purpose').notNull(),

  // Expiry — checked before attempting verification
  expires_at: timestamp('expires_at').notNull(),

  // Brute-force protection — incremented on each failed attempt
  // Verification is blocked after a set number of failed attempts
  attempts: integer('attempts').notNull().default(0),

  // Set when the OTP is successfully used — prevents reuse
  used_at: timestamp('used_at'),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Otp = typeof otps.$inferSelect;
export type NewOtp = typeof otps.$inferInsert;
