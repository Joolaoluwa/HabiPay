import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────────────

// Groups the checkboxes on the listing form
export const amenityCategoryEnum = pgEnum("amenity_category", [
  "power",
  "water",
  "security",
  "structure",
  "comfort",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

// The catalogue of amenities a property can have.
// Admins add new ones as rows, so no migration is needed for a new amenity.
// Retire an amenity with is_active = false, never by deleting it,
// because property_amenities rows still point at it.
export const amenities = pgTable("amenities", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Stable machine name used by the API and filters, e.g. "solar"
  code: varchar("code", { length: 50 }).notNull().unique(),

  // What the web form shows, e.g. "Solar power system"
  label: varchar("label", { length: 100 }).notNull(),

  category: amenityCategoryEnum("category").notNull(),

  is_active: boolean("is_active").notNull().default(true),

  created_at: timestamp("created_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Amenity = typeof amenities.$inferSelect;
export type NewAmenity = typeof amenities.$inferInsert;
