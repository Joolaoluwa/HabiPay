import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  decimal,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { applications } from "./applications";
import { repayment_schedules } from "./repayment-schedules";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const paymentTypeEnum = pgEnum("payment_type", [
  "down_payment",
  "repayment",
  "landlord_payout",
  "late_fee",
]);

export const paymentProviderEnum = pgEnum("payment_provider", [
  "paystack",
  "flutterwave",
  "bank_transfer",
]);

// Values differ from repayment_schedules' installment_status on purpose:
// this tracks a money movement, that tracks an obligation
export const paymentStatusEnum = pgEnum("payment_status", [
  "initiated",
  "successful",
  "failed",
  "reversed",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many payments belong to one user
  // RESTRICT: user cannot be deleted while payments exist
  // Deactivate via users.status instead of hard deleting
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  // Relationship — many payments belong to one application
  // RESTRICT: this is the money ledger, so it must outlive any cleanup
  application_id: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "restrict" }),

  // Relationship — which installment this payment covers
  // Nullable: only repayment (and late_fee) payments belong to an installment;
  // down_payment and landlord_payout do not
  // RESTRICT: an installment cannot be deleted while payments reference it
  // Which types require it is enforced at application logic level, not DB level
  repayment_schedule_id: uuid("repayment_schedule_id").references(
    () => repayment_schedules.id,
    { onDelete: "restrict" },
  ),

  // What the money movement is for
  payment_type: paymentTypeEnum("payment_type").notNull(),

  // Financials — stored as decimal, never float
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),

  // Provider details
  payment_provider: paymentProviderEnum("payment_provider").notNull(),
  // Generated when the payment is initiated and used to match the provider's
  // webhook back to this row
  // Unique: one reference identifies exactly one transaction, so a repeated
  // webhook cannot create or update a second payment
  provider_reference: varchar("provider_reference", { length: 255 })
    .notNull()
    .unique(),

  // Status
  // initiated → successful
  // initiated → failed
  // successful → reversed
  // Enforced at application logic level, not DB level
  payment_status: paymentStatusEnum("payment_status")
    .notNull()
    .default("initiated"),

  // Nullable: only set once the payment is successful
  paid_at: timestamp("paid_at"),

  // Timestamps
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;
