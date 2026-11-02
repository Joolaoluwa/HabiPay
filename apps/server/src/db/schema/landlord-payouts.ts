import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const payoutStatusEnum = pgEnum("payout_status", [
  "pending",
  "processing",
  "paid",
  "failed",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const landlord_payouts = pgTable("landlord_payouts", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many payouts can belong to one application
  // (a failed payout can be retried as a new row, keeping the failure on record)
  // RESTRICT: an application cannot be deleted while payouts exist,
  // because payouts are a financial record
  application_id: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "restrict" }),

  // The landlord is not stored here: it is already on applications.landlord_id,
  // so it is reached through application_id (single source of truth)

  // Financials — stored as decimal, never float
  // The upfront rent paid to the landlord (same scale as properties.annual_rent)
  payout_amount: decimal("payout_amount", {
    precision: 15,
    scale: 2,
  }).notNull(),

  // Payment provider's reference for this transfer
  // Nullable: a pending payout has not been sent to the provider yet
  // Unique: a provider reference identifies exactly one transfer
  // (Postgres allows many NULLs under a unique constraint)
  payment_reference: varchar("payment_reference", { length: 255 }).unique(),

  // Status
  // pending → sent to provider → processing → paid
  //                                         ↘ failed (retry creates a new row)
  // Enforced at application logic level, not DB level
  payout_status: payoutStatusEnum("payout_status").notNull().default("pending"),

  // Nullable: only set once the payout is actually paid
  payout_date: timestamp("payout_date"),

  // Timestamps
  created_at: timestamp("created_at").notNull().defaultNow(),
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type LandlordPayout = typeof landlord_payouts.$inferSelect;
export type NewLandlordPayout = typeof landlord_payouts.$inferInsert;
