import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  timestamp,
  boolean,
  text
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
  fullName: text('fullName').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phoneNumber: varchar('phoneNumber', { length: 11 }).notNull().unique(),

  // Auth
  password: varchar('password', { length: 255 }).notNull(),

  // Role & Status
  role: userRoleEnum('role').notNull().default('tenant'),
  status: userStatusEnum('status').notNull().default('pending'),

  // KYC — stored encrypted (AES-256 via utils/encryption.ts)
  // Raw BVN/NIN are never stored in plaintext
  bvn: varchar('bvn', { length: 25 }),
  nin: varchar('nin', { length: 25 }),

  // Verification flags — flipped to true after service verification (future)
  bvn_verified: boolean('bvn').notNull().default(false),
  nin_verified: boolean('nin').notNull().default(false),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

// Use these types across the codebase instead of raw SQL types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
