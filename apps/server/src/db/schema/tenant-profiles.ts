import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  decimal,
  timestamp,
} from 'drizzle-orm/pg-core';
import { users } from './users';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const employmentStatusEnum = pgEnum('employment_status', [
  'employed',
  'self_employed',
  'contract',
  'unemployed',
  'student',
]);

export const tenantVerificationStatusEnum = pgEnum(
  'tenant_verification_status',
  ['unverified', 'pending', 'verified', 'rejected']
);

// ─── Table ────────────────────────────────────────────────────────────────────

export const tenantProfiles = pgTable('tenant_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relationship — one tenant profile belongs to one user
  // RESTRICT: user cannot be deleted while this profile exists
  // Deactivate users via users.status instead of hard deleting
  user_id: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'restrict' }),

  // Employment
  employment_status: employmentStatusEnum('employment_status').notNull(),
  employer_name: text('employer_name'),
  monthly_income: decimal('monthly_income', { precision: 15, scale: 2 }),
  salary_payment_bank: varchar('salary_payment_bank', { length: 100 }),

    // ── Verification checks (admin or provider only, never from a tenant request) ──
  identity_check: tenantVerificationStatusEnum('identity_check').notNull().default('unverified'),
  employment_check: tenantVerificationStatusEnum('employment_check').notNull().default('unverified'),
  income_check: tenantVerificationStatusEnum('income_check').notNull().default('unverified'),
  // Address
  residential_address: text('residential_address').notNull(),

    // Income the admin confirmed from bank statements. Risk evaluation uses this,
    // never the self-reported monthly_income. Null until income is verified.
    verified_monthly_income: decimal('verified_monthly_income', { precision: 15, scale: 2 }),

    // CAC registration number: the employer's, or the tenant's own business if self-employed
    employer_rc_number: varchar('employer_rc_number', { length: 20 }),

    // Latest admin note, e.g. why a check was rejected. Full history goes to admin_actions
    verification_reason: text('verification_reason'),

  // Verification
  verification_status: tenantVerificationStatusEnum('verification_status')
    .notNull()
    .default('unverified'),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow().$onUpdate(() => new Date()),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantProfile = typeof tenantProfiles.$inferSelect;
export type NewTenantProfile = typeof tenantProfiles.$inferInsert;
export type EmploymentStatus = (typeof employmentStatusEnum.enumValues)[number];
export type TenantCheck = (typeof tenantVerificationStatusEnum.enumValues)[number];