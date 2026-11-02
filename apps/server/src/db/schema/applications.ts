import {
  pgTable,
  pgEnum,
  uuid,
  decimal,
  timestamp,
} from 'drizzle-orm/pg-core';
import { tenantProfiles } from './tenant-profiles';
import { properties } from './properties';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const applicationStatusEnum = pgEnum('application_status', [
  'draft',        // tenant started but has not formally submitted
  'submitted',    // tenant submitted, awaiting admin review
  'under_review', // admin is actively reviewing
  'approved',     // application approved, financing offer will be created
  'declined',     // admin declined the application
  'cancelled',    // tenant withdrew the application before a decision
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const applications = pgTable('applications', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relationships
  // RESTRICT on all — application records must not be orphaned
  // Landlord details are retrieved by joining: applications → properties → landlords
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenantProfiles.id, { onDelete: 'restrict' }),

  property_id: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'restrict' }),

  // Financials — all stored as decimal, never float
  requested_rent_amount: decimal('requested_rent_amount', {
    precision: 15,
    scale: 2,
  }).notNull(),

  requested_financing_amount: decimal('requested_financing_amount', {
    precision: 15,
    scale: 2,
  }).notNull(),

  tenant_down_payment: decimal('tenant_down_payment', {
    precision: 15,
    scale: 2,
  }).notNull(),

  // Status
  application_status: applicationStatusEnum('application_status')
    .notNull()
    .default('draft'),

  // Audit timestamps — nullable, set when the event actually occurs
  submitted_at: timestamp('submitted_at'),
  reviewed_at: timestamp('reviewed_at'),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Application = typeof applications.$inferSelect;
export type NewApplication = typeof applications.$inferInsert;
