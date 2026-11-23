import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  decimal,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { tenantProfiles } from "./tenant-profiles";
import { landlords } from "./landlords";
import { properties, propertyTypeEnum } from "./properties";
import { users } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

// submitted   → tenant sent it, no admin has acted yet
// contacted   → an admin has reached the landlord, onboarding in progress
// onboarded   → landlord has an account and the property exists (landlord_id and property_id set)
// declined    → landlord said no
// unreachable → admin could not reach the landlord
export const referralStatusEnum = pgEnum("referral_status", [
  "submitted",
  "contacted",
  "onboarded",
  "declined",
  "unreachable",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

// A landlord brought to HabiPay by a tenant. This is a record of how the landlord
// arrived, not the landlord. Once onboarded they become normal users and landlords
// rows, so applications, risk and payouts need no special case.
export const landlordReferrals = pgTable(
  "landlord_referrals",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // RESTRICT: the referring tenant's profile cannot be removed while referrals exist
    referred_by_tenant_id: uuid("referred_by_tenant_id")
      .notNull()
      .references(() => tenantProfiles.id, { onDelete: "restrict" }),

    // ── Landlord contact details (admin only, never shown to other users) ─────
    // Name and phone are required on submission (enforced by zod), but nullable
    // here so they can be cleared once a declined or unreachable referral passes
    // its retention period. This person never signed up or agreed to anything
    landlord_full_name: varchar("landlord_full_name", { length: 150 }),
    landlord_phone: varchar("landlord_phone", { length: 20 }),
    landlord_email: varchar("landlord_email", { length: 255 }),

    // ── The property the tenant wants financed ────────────────────────────────
    property_address: text("property_address").notNull(),
    city: varchar("city", { length: 100 }).notNull(),
    state: varchar("state", { length: 100 }).notNull(),
    property_type: propertyTypeEnum("property_type"),
    // What the tenant says the landlord charges. The real figure goes on the property
    annual_rent: decimal("annual_rent", { precision: 15, scale: 2 }),
    notes: text("notes"), // e.g. best time to call

    // ── Progress ──────────────────────────────────────────────────────────────
    status: referralStatusEnum("status").notNull().default("submitted"),

    // Filled in on onboarding. RESTRICT: core records are never deleted
    landlord_id: uuid("landlord_id").references(() => landlords.id, {
      onDelete: "restrict",
    }),
    property_id: uuid("property_id").references(() => properties.id, {
      onDelete: "restrict",
    }),

    // The admin working on it
    handled_by: uuid("handled_by").references(() => users.id, {
      onDelete: "restrict",
    }),

    // When it reached onboarded, declined or unreachable. Starts the retention clock
    resolved_at: timestamp("resolved_at"),

    // ── Timestamps ────────────────────────────────────────────────────────────
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("landlord_referrals_tenant_idx").on(t.referred_by_tenant_id),
    index("landlord_referrals_status_idx").on(t.status),
    // Used when a tenant lists properties: "is this referral property mine?"
    index("landlord_referrals_property_idx").on(t.property_id),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type LandlordReferral = typeof landlordReferrals.$inferSelect;
export type NewLandlordReferral = typeof landlordReferrals.$inferInsert;
