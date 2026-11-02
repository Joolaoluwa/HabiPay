import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";
import { applications } from "./applications";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const offerStatusEnum = pgEnum("offer_status", [
  "pending",
  "accepted",
  "rejected",
  "expired",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const financing_offers = pgTable("financing_offers", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many offers can belong to one application
  // (an offer can be rejected or expire, then a fresh offer is issued)
  // RESTRICT: an application cannot be deleted while offers exist,
  // because offers are the commercial/audit record of what was promised
  application_id: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "restrict" }),

  // Approved terms — stored as decimal, never float
  // These are the FINAL approved figures and may differ from what the tenant
  // requested on the application, so they are stored here and not derived
  approved_rent_amount: decimal("approved_rent_amount", {
    precision: 15,
    scale: 2,
  }).notNull(),
  approved_financing_amount: decimal("approved_financing_amount", {
    precision: 15,
    scale: 2,
  }).notNull(),
  down_payment_amount: decimal("down_payment_amount", {
    precision: 15,
    scale: 2,
  }).notNull(),

  // Cost of financing
  // total_repayment_amount = approved_financing_amount + financing_fee
  // Calculated at application logic level and stored as a snapshot,
  // so later changes to fee rules never rewrite an existing offer
  financing_fee: decimal("financing_fee", {
    precision: 15,
    scale: 2,
  }).notNull(),
  total_repayment_amount: decimal("total_repayment_amount", {
    precision: 15,
    scale: 2,
  }).notNull(),

  // Repayment plan
  // monthly_installment ≈ total_repayment_amount / repayment_months
  // repayment_schedules rows are generated from these values on acceptance
  repayment_months: integer("repayment_months").notNull(),
  monthly_installment: decimal("monthly_installment", {
    precision: 15,
    scale: 2,
  }).notNull(),

  // Status
  // pending → tenant accepts → accepted (accepted_at set)
  // pending → tenant declines → rejected
  // pending → validity window passes → expired
  // Enforced at application logic level, not DB level
  offer_status: offerStatusEnum("offer_status").notNull().default("pending"),

  // Timestamps
  created_at: timestamp("created_at").notNull().defaultNow(),
  // Nullable: only set once the tenant accepts the offer
  accepted_at: timestamp("accepted_at"),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type FinancingOffer = typeof financing_offers.$inferSelect;
export type NewFinancingOffer = typeof financing_offers.$inferInsert;
