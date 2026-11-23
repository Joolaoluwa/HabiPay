import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { properties } from "./properties";
import { amenities } from "./amenities";

// ─── Enums ────────────────────────────────────────────────────────────────────

// private: only this unit uses it. shared: used by the whole compound or building
// e.g. a generator for public use is the same amenity as a private one, with scope "shared"
export const amenityScopeEnum = pgEnum("amenity_scope", ["private", "shared"]);

// ─── Table ────────────────────────────────────────────────────────────────────

// Which property has which amenity. One row per pair.
export const propertyAmenities = pgTable(
  "property_amenities",
  {
    // CASCADE: these rows only describe the property. They are replaced whenever
    // a landlord edits the amenity list, so they are not core records
    property_id: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    // RESTRICT: an amenity in use cannot be deleted; retire it with is_active instead
    amenity_id: uuid("amenity_id")
      .notNull()
      .references(() => amenities.id, { onDelete: "restrict" }),

    scope: amenityScopeEnum("scope").notNull().default("private"),

    // Optional detail, e.g. "Generator runs 6pm to midnight"
    note: varchar("note", { length: 150 }),
  },
  (t) => [
    // The pair is the key, so the same amenity can't be added twice to one property
    primaryKey({ columns: [t.property_id, t.amenity_id] }),
    // For "properties that have solar" filters
    index("property_amenities_amenity_id_idx").on(t.amenity_id),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type PropertyAmenity = typeof propertyAmenities.$inferSelect;
export type NewPropertyAmenity = typeof propertyAmenities.$inferInsert;
