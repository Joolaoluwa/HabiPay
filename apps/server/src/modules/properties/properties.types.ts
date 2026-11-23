import { z } from "zod";
import {
  furnishingEnum,
  propertyConditionEnum,
  propertyStatusEnum,
  propertyTypeEnum,
} from "../../db/schema/properties";
import { amenityScopeEnum } from "../../db/schema/property-amenities";
import { money, paginationFields, requiredText } from "../../utils/validators";

const roomCount = (max: number) => z.number().int().min(0).max(max);

// ─── Amenities in a request body ──────────────────────────────────────────────
// [{ "code": "generator", "scope": "shared", "note": "Runs 6pm to midnight" }]
// Codes are checked against the amenities catalogue in the service
const amenityItem = z
  .object({
    code: z.string().trim().toLowerCase().min(1).max(50),
    scope: z.enum(amenityScopeEnum.enumValues).default("private"),
    note: z.string().trim().max(150).optional(),
  })
  .strict();

const amenityList = z
  .array(amenityItem)
  .max(40)
  .refine((list) => new Set(list.map((a) => a.code)).size === list.length, {
    message: "Each amenity can only be listed once",
  });

// ─── Body schemas ─────────────────────────────────────────────────────────────

// .strict() makes unknown fields a 400. Never accepted from a request:
// landlord_id (from the caller's record), status (its own endpoint and the
// system), listing_type (set when an admin links a referral)
const propertyFields = z
  .object({
    title: requiredText(150),
    description: z.string().trim().max(5000).optional(),

    address: requiredText(500),
    city: requiredText(100),
    state: requiredText(100),

    property_type: z.enum(propertyTypeEnum.enumValues),
    bedrooms: roomCount(50),
    bathrooms: roomCount(50),
    toilets: roomCount(50),
    living_room: roomCount(20).optional(),
    parking_spaces: roomCount(100).optional(),
    size_sqm: z.number().int().positive().max(1_000_000).optional(),
    furnishing: z.enum(furnishingEnum.enumValues).optional(),
    condition: z.enum(propertyConditionEnum.enumValues).optional(),

    annual_rent: money(),
    lease_duration_months: z.number().int().min(1).max(60),

    amenities: amenityList.optional(),
  })
  .strict();

export const createPropertySchema = propertyFields;

// Same fields, all optional, at least one required.
// Sending "amenities" replaces the whole list; leaving it out keeps the current one.
export const updatePropertySchema = propertyFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

// Owners and admins can only toggle these two. reserved and occupied are
// set by the system (approval and payout), never by a request
export const updatePropertyStatusSchema = z
  .object({
    status: z.enum(["available", "pending"]),
  })
  .strict();

// PATCH /properties/:id/images
// order: every image id of the property, in the new gallery order
// cover_image_id: optional, makes that image the cover
export const reorderImagesSchema = z
  .object({
    order: z.array(z.string().uuid()).min(1).max(15),
    cover_image_id: z.string().uuid().optional(),
  })
  .strict()
  .refine((b) => new Set(b.order).size === b.order.length, {
    message: "Each image can only appear once",
    path: ["order"],
  });

// ─── Query and params schemas ─────────────────────────────────────────────────

export const listPropertiesQuerySchema = z
  .object({
    ...paginationFields,
    city: z.string().trim().min(1).max(100).optional(),
    state: z.string().trim().min(1).max(100).optional(),
    property_type: z.enum(propertyTypeEnum.enumValues).optional(),
    min_rent: money().optional(),
    max_rent: money().optional(),
    min_bedrooms: z.coerce.number().int().min(0).max(50).optional(),
    furnishing: z.enum(furnishingEnum.enumValues).optional(),
    // ?amenities=solar,generator → properties that have ALL of them
    amenities: z
      .string()
      .transform((v) =>
        v
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
      .pipe(z.array(z.string().max(50)).max(10))
      .optional(),
    // Only honoured for landlords and admins. Tenants are always limited to
    // available properties in the controller, whatever they send
    status: z.enum(propertyStatusEnum.enumValues).optional(),
  })
  .refine(
    (q) =>
      !q.min_rent || !q.max_rent || Number(q.min_rent) <= Number(q.max_rent),
    { message: "min_rent cannot be greater than max_rent", path: ["min_rent"] },
  );

export const propertyIdParamSchema = z.object({
  id: z.string().uuid("Invalid property id"),
});

export const propertyImageParamSchema = z.object({
  id: z.string().uuid("Invalid property id"),
  imageId: z.string().uuid("Invalid image id"),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type AmenityInput = z.infer<typeof amenityItem>;
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;
export type UpdatePropertyStatusInput = z.infer<
  typeof updatePropertyStatusSchema
>;
export type ReorderImagesInput = z.infer<typeof reorderImagesSchema>;
export type ListPropertiesQuery = z.infer<typeof listPropertiesQuerySchema>;
export type PropertyIdParams = z.infer<typeof propertyIdParamSchema>;
export type PropertyImageParams = z.infer<typeof propertyImageParamSchema>;
