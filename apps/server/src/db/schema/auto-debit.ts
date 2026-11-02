import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { financing_offers } from "./financing-offers";
import { paymentProviderEnum } from "./payments";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const mandateStatusEnum = pgEnum("mandate_status", [
  "active",
  "inactive",
  "failed",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const auto_debit_mandates = pgTable("auto_debit_mandates", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many mandates can belong to one financing offer
  // (a failed or cancelled mandate can be replaced by a new one)
  // The user is not stored here: it is reached through the offer →
  // application → tenant chain (single source of truth)
  // RESTRICT: an offer cannot be deleted while mandates exist
  financing_offer_id: uuid("financing_offer_id")
    .notNull()
    .references(() => financing_offers.id, { onDelete: "restrict" }),

  // Which gateway holds the authorization
  // Reuses the payment gateway list from payments so providers live in one place
  provider: paymentProviderEnum("provider").notNull(),

  // Issued by the provider once the tenant authorizes the debit
  // Nullable: a mandate that fails before authorization has no reference yet
  // Unique: one provider reference identifies exactly one authorization
  // (Postgres allows many NULLs under a unique constraint)
  mandate_reference: varchar("mandate_reference", { length: 255 }).unique(),

  // Status
  // inactive (created, not yet authorized) → active (provider confirmed)
  // inactive → failed (authorization did not go through)
  // active → inactive (cancelled or offer fully repaid)
  // Enforced at application logic level, not DB level
  status: mandateStatusEnum("status").notNull().default("inactive"),

  // Calendar dates only — a mandate covers days, not a time of day
  start_date: date("start_date").notNull(),
  // Nullable: a mandate may run until the offer is fully repaid
  end_date: date("end_date"),

  // Timestamps
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type AutoDebitMandate = typeof auto_debit_mandates.$inferSelect;
export type NewAutoDebitMandate = typeof auto_debit_mandates.$inferInsert;
