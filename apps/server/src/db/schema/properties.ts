import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  decimal,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { landlords } from "./landlords";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const propertyTypeEnum = pgEnum("property_type", [
  "flat",
  "duplex",
  "bungalow",
  "self_contain",
  "room_and_parlour",
  "detached_house",
  "semi_detached",
  "commercial",
]);

// New values are appended, never inserted in the middle
export const propertyStatusEnum = pgEnum("property_status", [
  "available", // open for applications
  "pending", // not open: landlord not verified, no cover image, or delisted by the owner
  "occupied", // set by the system after landlord payout
  "reserved", // held for an approved applicant until the offer resolves
]);

export const furnishingEnum = pgEnum("furnishing", [
  "unfurnished",
  "semi_furnished",
  "furnished",
]);

export const propertyConditionEnum = pgEnum("property_condition", [
  "newly_built",
  "renovated",
  "fairly_used",
]);

// marketplace: listed publicly by the landlord
// referral:    brought in by a tenant; visible only to that tenant, the owner and admins
//              (the link to the tenant lives in landlord_referrals.property_id)
export const listingTypeEnum = pgEnum("listing_type", [
  "marketplace",
  "referral",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const properties = pgTable(
  "properties",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Relationship — many properties belong to one landlord
    // RESTRICT: landlord cannot be deleted while properties exist
    // Deactivate via users.status instead of hard deleting
    landlord_id: uuid("landlord_id")
      .notNull()
      .references(() => landlords.id, { onDelete: "restrict" }),

    listing_type: listingTypeEnum("listing_type")
      .notNull()
      .default("marketplace"),

    // ── Listing text ──────────────────────────────────────────────────────────
    title: varchar("title", { length: 150 }).notNull(), // e.g. "3 bedroom flat in Yaba"
    description: text("description"),

    // ── Location ──────────────────────────────────────────────────────────────
    address: text("address").notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }).notNull(),

    // ── Structure (columns, because tenants filter by these) ──────────────────
    property_type: propertyTypeEnum("property_type").notNull(),
    bedrooms: integer("bedrooms").notNull(),
    bathrooms: integer("bathrooms").notNull(),
    toilets: integer("toilets").notNull(),
    living_rooms: integer("living_rooms").notNull().default(0),
    parking_spaces: integer("parking_spaces").notNull().default(0),
    size_sqm: integer("size_sqm"), // optional, many landlords won't know it
    furnishing: furnishingEnum("furnishing").notNull().default("unfurnished"),
    condition: propertyConditionEnum("condition"),
    // Amenities (generator, solar, balcony...) live in property_amenities
    // Photos live in property_images

    // ── Financials — stored as decimal, never float ───────────────────────────
    annual_rent: decimal("annual_rent", { precision: 15, scale: 2 }).notNull(),
    lease_duration_months: integer("lease_duration_months").notNull(),

    // ── Status (enforced in application logic, not the DB) ────────────────────
    // Created as pending → available once the landlord is verified AND a cover image exists
    // available → reserved when an application is approved
    // reserved → occupied after payout
    // reserved → available if the offer is rejected or expires
    //            (or pending if the landlord is no longer verified)
    // Owner may toggle available ↔ pending, never while reserved or occupied
    status: propertyStatusEnum("status").notNull().default("pending"),

    // ── Timestamps ────────────────────────────────────────────────────────────
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("properties_landlord_id_idx").on(t.landlord_id),
    index("properties_status_idx").on(t.status),
    // Matches the list filter lower(city) = lower($1), so the index is usable
    index("properties_city_lower_idx").on(sql`lower(${t.city})`),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type Property = typeof properties.$inferSelect;
export type NewProperty = typeof properties.$inferInsert;
