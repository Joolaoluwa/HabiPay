import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const notificationChannelEnum = pgEnum("notification_channel", [
  "sms",
  "email",
  "whatsapp",
]);

export const notificationTypeEnum = pgEnum("notification_type", [
  "approval",
  "repayment_reminder",
  "payment_success",
  "payment_failed",
]);

// The doc gives no values for sent_status
export const sentStatusEnum = pgEnum("sent_status", [
  "pending",
  "sent",
  "failed",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many notifications belong to one user
  // RESTRICT: this is an audit trail of communications, so it must outlive
  // any cleanup; deactivate via users.status instead of hard deleting
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  // How and why the user was contacted
  channel: notificationChannelEnum("channel").notNull(),
  notification_type: notificationTypeEnum("notification_type").notNull(),

  // Content
  // Nullable: sms and whatsapp messages have no subject line, only email does
  subject: varchar("subject", { length: 255 }),
  // The exact text sent, kept as sent so the audit trail never changes
  message: text("message").notNull(),

  // Status
  // pending (queued) → sent (provider accepted it) or failed
  // Enforced at application logic level, not DB level
  sent_status: sentStatusEnum("sent_status").notNull().default("pending"),

  // Nullable: only set once the message has actually been sent
  sent_at: timestamp("sent_at"),

  // Timestamps
  // created_at (queued) and sent_at (delivered) already form the timeline,
  // so no updated_at
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
