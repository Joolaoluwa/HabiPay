import {
  pgTable,
  pgEnum,
  uuid,
  integer,
  decimal,
  date,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { financing_offers } from "./financing-offers";

// ─── Enums ────────────────────────────────────────────────────────────────────

// Named 'installment_status' in Postgres (not 'payment_status') because enum
// names are global to the database and the payments table has its own,
// different payment_status values. The column keeps the doc's name.
export const installmentStatusEnum = pgEnum("installment_status", [
  "pending",
  "paid",
  "partial",
  "late",
  "defaulted",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const repayment_schedules = pgTable(
  "repayment_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // Relationship — many installments belong to one financing offer
    // RESTRICT: an offer cannot be deleted while its schedule exists,
    // because installments are a financial record
    // The tenant and application are reached through the offer, not stored here
    financing_offer_id: uuid("financing_offer_id")
      .notNull()
      .references(() => financing_offers.id, { onDelete: "restrict" }),

    // Position in the plan: 1 … financing_offers.repayment_months
    // Rows are generated when the offer is accepted
    installment_number: integer("installment_number").notNull(),

    // Calendar date only — an installment is due on a day, not at a time
    due_date: date("due_date").notNull(),

    // Financials — stored as decimal, never float
    // amount_due is a snapshot of financing_offers.monthly_installment
    amount_due: decimal("amount_due", { precision: 15, scale: 2 }).notNull(),
    // Running total received for this installment; supports partial payments
    amount_paid: decimal("amount_paid", { precision: 15, scale: 2 })
      .notNull()
      .default("0.00"),
    // Late fee charged on this installment; 0 until it becomes late
    late_fee_amount: decimal("late_fee_amount", { precision: 15, scale: 2 })
      .notNull()
      .default("0.00"),

    // Status
    // pending → paid
    // pending → partial (some paid) → paid
    // pending / partial → late (past due_date) → paid or defaulted
    // Enforced at application logic level, not DB level
    payment_status: installmentStatusEnum("payment_status")
      .notNull()
      .default("pending"),

    // Nullable: only set once the installment is fully paid
    paid_at: timestamp("paid_at"),

    // Timestamps
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // An offer cannot have two installment #3s
    unique("repayment_schedules_offer_installment_unique").on(
      table.financing_offer_id,
      table.installment_number,
    ),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type RepaymentSchedule = typeof repayment_schedules.$inferSelect;
export type NewRepaymentSchedule = typeof repayment_schedules.$inferInsert;
