import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./users";
import { applications } from "./applications";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const documentTypeEnum = pgEnum("document_type", [
  "id_card",
  "bank_statement",
  "employment_letter",
  "tenancy_agreement",
]);

// The doc gives no values for verification_status
export const verificationStatusEnum = pgEnum("verification_status", [
  "pending",
  "verified",
  "rejected",
]);

// ─── Table ────────────────────────────────────────────────────────────────────

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),

  // Relationship — many documents belong to one user
  // Stored here (not only via the application) because KYC documents such as
  // an ID card are uploaded by the user before any application exists
  // RESTRICT: user cannot be deleted while documents exist
  // Deactivate via users.status instead of hard deleting
  user_id: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),

  // Relationship — a document may be attached to one application
  // Nullable: KYC documents are not tied to a specific application
  // RESTRICT: an application cannot be deleted while documents reference it
  application_id: uuid("application_id").references(() => applications.id, {
    onDelete: "restrict",
  }),

  // Document details
  document_type: documentTypeEnum("document_type").notNull(),
  // Location of the stored file (e.g. object storage URL), not the file itself
  // text, not varchar: signed or long storage URLs can exceed typical limits
  file_url: text("file_url").notNull(),

  // Status
  // pending → admin reviews → verified or rejected
  // Enforced at application logic level, not DB level
  verification_status: verificationStatusEnum("verification_status")
    .notNull()
    .default("pending"),

  // Timestamps
  // uploaded_at is the creation time, so no separate created_at
  uploaded_at: timestamp("uploaded_at").notNull().defaultNow(),
  // Changes when verification_status changes (review timeline)
  updated_at: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
