import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
  'tenant',
  'landlord',
  'admin',
]);

export const userStatusEnum = pgEnum('user_status', [
  'active',
  'pending',
  'suspended',
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Identity
  full_name: varchar('full_name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone_number: varchar('phone_number', { length: 20 }).notNull().unique(),

  // Auth
  password_hash: varchar('password_hash', { length: 255 }).notNull(),

  // Role & Status
  role: userRoleEnum('role').notNull().default('tenant'),
  status: userStatusEnum('status').notNull().default('pending'),

  // KYC — stored encrypted (AES-256 via utils/encryption.ts)
  // Raw BVN/NIN are never stored in plaintext
  bvn_encrypted: varchar('bvn_encrypted', { length: 512 }),
  nin_encrypted: varchar('nin_encrypted', { length: 512 }),

  // Verification flags — flipped to true after service verification (future)
  bvn_verified: boolean('bvn_verified').notNull().default(false),
  nin_verified: boolean('nin_verified').notNull().default(false),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
