import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  decimal,
  integer,
  timestamp,
} from 'drizzle-orm/pg-core';
import { landlords } from './landlords';

// ─── Enums ────────────────────────────────────────────────────────────────────

export const propertyTypeEnum = pgEnum('property_type', [
  'flat',
  'duplex',
  'bungalow',
  'self_contain',
  'room_and_parlour',
  'detached_house',
  'semi_detached',
  'commercial',
]);

export const propertyStatusEnum = pgEnum('property_status', [
  'available',
  'pending',
  'occupied',
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const properties = pgTable('properties', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Relationship — many properties belong to one landlord
  // RESTRICT: landlord cannot be deleted while properties exist
  // Deactivate via users.status instead of hard deleting
  landlord_id: uuid('landlord_id')
    .notNull()
    .references(() => landlords.id, { onDelete: 'restrict' }),

  // Location
  address: text('address').notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),

  // Property Details
  property_type: propertyTypeEnum('property_type').notNull(),

  // Financials — stored as decimal, never float
  annual_rent: decimal('annual_rent', { precision: 15, scale: 2 }).notNull(),
  lease_duration_months: integer('lease_duration_months').notNull(),

  // Status
  // available → tenant submits application → pending → deal closes → occupied
  // Enforced at application logic level, not DB level
  status: propertyStatusEnum('status').notNull().default('available'),

  // Timestamps
  created_at: timestamp('created_at').notNull().defaultNow(),
  updated_at: timestamp('updated_at').notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
