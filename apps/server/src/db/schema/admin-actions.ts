import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { applications } from "./applications";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const adminActionTypeEnum = pgEnum("admin_action_type", [
  "approve",
  "decline",
  "flag",
  "edit",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const admin_actions = pgTable("admin_actions", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many actions are taken by one admin user
  // Must be a user with the admin role
  // Enforced at application logic level, not DB level
  // RESTRICT: this is a compliance record, so the admin cannot be deleted
  // while their actions exist; deactivate via users.status instead
  admin_user_id: uuid("admin_user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  // Relationship — many actions can be taken on one application
  // RESTRICT: an application cannot be deleted while its decision history exists
  application_id: uuid("application_id")
    .notNull()
    .references(() => applications.id, { onDelete: "restrict" }),

  // What the admin did
  action_type: adminActionTypeEnum("action_type").notNull(),

  // Why they did it
  // Nullable: an approval may need no explanation
  // Required for decline, flag and edit
  // Enforced at application logic level, not DB level
  reason: text("reason"),

  // Timestamps
  // Append-only audit log: rows are never updated, so no updated_at
  created_at: timestamp("created_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdminAction = typeof admin_actions.$inferSelect;
export type NewAdminAction = typeof admin_actions.$inferInsert;
