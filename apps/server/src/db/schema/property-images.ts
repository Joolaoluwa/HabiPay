import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { properties } from "./properties";

// ─── Table ────────────────────────────────────────────────────────────────────

// Photos of a property. Unlike tenant documents, these are meant to be seen,
// so they use Cloudinary's public delivery. Documents stay private.
export const propertyImages = pgTable(
  "property_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // CASCADE: an image only describes the property
    property_id: uuid("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),

    // Cloudinary public_id. Needed to delete the file or request resized versions
    storage_key: varchar("storage_key", { length: 255 }).notNull().unique(),
    url: text("url").notNull(),

    // Gallery position, 0 first
    sort_order: integer("sort_order").notNull().default(0),

    // The main photo shown on listing cards.
    // A property cannot become available without one (enforced in the service)
    is_cover: boolean("is_cover").notNull().default(false),

    // Optional room label, e.g. "Master bedroom", "Kitchen"
    caption: varchar("caption", { length: 100 }),

    // Returned by Cloudinary on upload; lets the frontend reserve space before loading
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes"),

    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("property_images_property_order_idx").on(t.property_id, t.sort_order),
    // At most one cover per property, enforced by Postgres itself
    uniqueIndex("property_images_one_cover_idx")
      .on(t.property_id)
      .where(sql`${t.is_cover} = true`),
  ],
);

// ─── Types ────────────────────────────────────────────────────────────────────

export type PropertyImage = typeof propertyImages.$inferSelect;
export type NewPropertyImage = typeof propertyImages.$inferInsert;
