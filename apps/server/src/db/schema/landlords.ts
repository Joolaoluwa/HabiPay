import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const landlordVerificationStatusEnum = pgEnum(
  'landlord_verification_status',
  ['unverified', 'pending', 'verified', 'rejected']
);

// ─── Table ────────────────────────────────────────────────────────────────────

export const landlords = pgTable('landlords', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relationship — one landlord record belongs to one user (role: landlord)
  // Identity (full_name, email, phone_number) lives on users table — no duplication
  // RESTRICT: user cannot be deleted while a landlord record exists
  // Deactivate via users.status instead of hard deleting
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'restrict' }),

  // Bank Details
  // bank_account_number is encrypted (AES-256 via utils/encryption.ts)
  // Raw account numbers are never stored in plaintext
  bank_name: varchar('bank_name', { length: 100 }).notNull(),
  bank_account_number: varchar('bank_account_number', { length: 512 }).notNull(),
  account_name: varchar('account_name', { length: 255 }).notNull(),

  // Verification — admin must verify bank details before payout can be triggered
  verification_status: landlordVerificationStatusEnum('landlord_verification_status')
    .notNull()
    .default('unverified'),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Landlord = typeof landlords.$inferSelect;
export type NewLandlord = typeof landlords.$inferInsert;
