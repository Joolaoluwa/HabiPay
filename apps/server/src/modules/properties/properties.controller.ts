import { Request, Response, NextFunction } from "express";
import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  gte,
  lte,
  max,
  or,
  sql,
  SQL,
} from "drizzle-orm";
import { TokenPayload } from "../auth/auth.service";
import { db } from "../../config/db";
import { properties } from "../../db/schema/properties";
import { amenities } from "../../db/schema/amenities";
import { propertyAmenities } from "../../db/schema/property-amenities";
import { propertyImages } from "../../db/schema/property-images";
import { landlordReferrals } from "../../db/schema/landlord-referral";
import { AppError } from "../../utils/appresponse";
import { pageMeta } from "../../utils/validators";
import {
  deleteImage,
  uploadImage,
  UploadedImage,
} from "../../utils/cloudinary";
import { getTenantProfileForUser } from "../tenants/tenant.service";
import {
  CreatePropertyInput,
  ListPropertiesQuery,
  PropertyIdParams,
  PropertyImageParams,
  ReorderImagesInput,
  UpdatePropertyInput,
  UpdatePropertyStatusInput,
} from "./properties.types";
import {
  MAX_IMAGES_PER_PROPERTY,
  attachCardExtras,
  canGoLive,
  canManageProperty,
  canViewProperty,
  getLandlordForUser,
  getPropertyDetails,
  getPropertyImages,
  hasActiveApplication,
  replacePropertyAmenities,
  resolveAmenities,
} from "./properties.service";

// Loads a property the caller may change, or null (caller returns 404).
// Not found and not yours look the same, so ids can't be probed
async function loadManagedProperty(requester: TokenPayload, id: string) {
  const [property] = await db
    .select()
    .from(properties)
    .where(eq(properties.id, id))
    .limit(1);
  if (!property || !(await canManageProperty(requester, property))) return null;
  return property;
}

// ─── Catalogue ────────────────────────────────────────────────────────────────

// GET /properties/amenities — the checkbox list for the listing form
export async function listAmenities(
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const rows = await db
      .select({
        code: amenities.code,
        label: amenities.label,
        category: amenities.category,
      })
      .from(amenities)
      .where(eq(amenities.is_active, true))
      .orderBy(asc(amenities.category), asc(amenities.label));

    return res.status(200).json({ success: true, data: rows });
  } catch (err) {
    return next(err);
  }
}

// ─── Properties ───────────────────────────────────────────────────────────────

// POST /properties
export async function createProperty(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { amenities: amenityInput = [], ...fields } =
      req.body as CreatePropertyInput;

    const landlord = await getLandlordForUser(requester.id);
    if (!landlord) {
      return next(
        new AppError(
          403,
          "Create your landlord profile before listing a property",
        ),
      );
    }

    const { byCode, unknown } = await resolveAmenities(
      amenityInput.map((a) => a.code),
    );
    if (unknown.length > 0) {
      return next(
        new AppError(400, `Unknown amenities: ${unknown.join(", ")}`),
      );
    }

    // Property and amenities are saved together or not at all
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(properties)
        .values({
          ...fields,
          landlord_id: landlord.id, // always from the caller's record, never from the body
          // Always pending at creation: there's no cover photo yet. The landlord
          // lists it with PATCH /properties/:id/status once photos are uploaded
          status: "pending",
        })
        .returning();
      if (!row) throw new AppError(500, "Could not create property");

      await replacePropertyAmenities(tx, row.id, amenityInput, byCode);
      return row;
    });

    const details = await getPropertyDetails(created.id);
    return res
      .status(201)
      .json({ success: true, data: { ...created, ...details } });
  } catch (err) {
    return next(err);
  }
}

// GET /properties/:id
export async function getPropertyById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as PropertyIdParams;

    const [property] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1);

    if (!property || !(await canViewProperty(requester, property))) {
      return next(new AppError(404, "Property not found"));
    }

    const details = await getPropertyDetails(property.id);
    return res
      .status(200)
      .json({ success: true, data: { ...property, ...details } });
  } catch (err) {
    return next(err);
  }
}

// GET /properties
export async function listProperties(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const q = res.locals.query as ListPropertiesQuery;

    const conditions: (SQL | undefined)[] = [];

    // ── Scope: who can see what. Applied first; filters can only narrow it ───
    if (requester.role === "tenant") {
      conditions.push(eq(properties.status, "available"));

      // Marketplace listings, plus referral properties this tenant brought in
      const tenant = await getTenantProfileForUser(requester.id);
      conditions.push(
        tenant
          ? or(
              eq(properties.listing_type, "marketplace"),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(landlordReferrals)
                  .where(
                    and(
                      eq(landlordReferrals.property_id, properties.id),
                      eq(landlordReferrals.referred_by_tenant_id, tenant.id),
                    ),
                  ),
              ),
            )
          : eq(properties.listing_type, "marketplace"),
      );
    } else {
      if (requester.role === "landlord") {
        const landlord = await getLandlordForUser(requester.id);
        // No landlord record means no properties, so skip the database
        if (!landlord) {
          return res
            .status(200)
            .json({
              success: true,
              data: [],
              pagination: pageMeta(q.page, q.limit, 0),
            });
        }
        conditions.push(eq(properties.landlord_id, landlord.id));
      }
      // Landlords (own properties) and admins (all) may filter by status
      if (q.status) conditions.push(eq(properties.status, q.status));
    }

    // ── Filters ──────────────────────────────────────────────────────────────
    // Case-insensitive exact match. Not ilike, so % and _ are not wildcards
    if (q.city)
      conditions.push(sql`lower(${properties.city}) = lower(${q.city})`);
    if (q.state)
      conditions.push(sql`lower(${properties.state}) = lower(${q.state})`);
    if (q.property_type)
      conditions.push(eq(properties.property_type, q.property_type));
    if (q.min_rent) conditions.push(gte(properties.annual_rent, q.min_rent));
    if (q.max_rent) conditions.push(lte(properties.annual_rent, q.max_rent));
    if (q.min_bedrooms !== undefined)
      conditions.push(gte(properties.bedrooms, q.min_bedrooms));
    if (q.furnishing) conditions.push(eq(properties.furnishing, q.furnishing));

    // Each requested amenity must be present (solar AND generator, not OR)
    for (const code of q.amenities ?? []) {
      conditions.push(
        exists(
          db
            .select({ one: sql`1` })
            .from(propertyAmenities)
            .innerJoin(
              amenities,
              eq(amenities.id, propertyAmenities.amenity_id),
            )
            .where(
              and(
                eq(propertyAmenities.property_id, properties.id),
                eq(amenities.code, code),
              ),
            ),
        ),
      );
    }

    // and() drops undefined entries and returns undefined if nothing is left
    const where = and(...conditions);
    const offset = (q.page - 1) * q.limit;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(properties)
        .where(where)
        // id as a tie-breaker keeps pages stable when created_at values match
        .orderBy(desc(properties.created_at), desc(properties.id))
        .limit(q.limit)
        .offset(offset),
      db.select({ total: count() }).from(properties).where(where),
    ]);

    const data = await attachCardExtras(rows);
    return res
      .status(200)
      .json({
        success: true,
        data,
        pagination: pageMeta(q.page, q.limit, totalRow?.total ?? 0),
      });
  } catch (err) {
    return next(err);
  }
}

// PUT /properties/:id
export async function updateProperty(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as PropertyIdParams;
    const { amenities: amenityInput, ...fields } =
      req.body as UpdatePropertyInput;

    const property = await loadManagedProperty(requester, id);
    if (!property) return next(new AppError(404, "Property not found"));

    if (property.status === "occupied") {
      return next(new AppError(409, "An occupied property cannot be edited"));
    }

    // The tenant applied against these terms, so they can't move underneath them
    const touchesTerms =
      fields.annual_rent !== undefined ||
      fields.lease_duration_months !== undefined;
    if (
      touchesTerms &&
      (property.status === "reserved" ||
        (await hasActiveApplication(property.id)))
    ) {
      return next(
        new AppError(
          409,
          "Rent and lease length are locked while an application on this property is in progress",
        ),
      );
    }

    let byCode = new Map<string, string>();
    if (amenityInput) {
      const resolved = await resolveAmenities(amenityInput.map((a) => a.code));
      if (resolved.unknown.length > 0) {
        return next(
          new AppError(
            400,
            `Unknown amenities: ${resolved.unknown.join(", ")}`,
          ),
        );
      }
      byCode = resolved.byCode;
    }

    await db.transaction(async (tx) => {
      // updated_at is set explicitly so an amenities-only edit still bumps it,
      // and so .set() is never empty (Drizzle throws on an empty set)
      await tx
        .update(properties)
        .set({ ...fields, updated_at: new Date() })
        .where(eq(properties.id, id));

      if (amenityInput)
        await replacePropertyAmenities(tx, id, amenityInput, byCode);
    });

    const [updated] = await db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1);
    if (!updated) return next(new AppError(404, "Property not found"));

    const details = await getPropertyDetails(id);
    return res
      .status(200)
      .json({ success: true, data: { ...updated, ...details } });
  } catch (err) {
    return next(err);
  }
}

// PATCH /properties/:id/status
export async function updatePropertyStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as PropertyIdParams;
    const { status } = req.body as UpdatePropertyStatusInput;

    const property = await loadManagedProperty(requester, id);
    if (!property) return next(new AppError(404, "Property not found"));

    // reserved and occupied belong to the application and payout flow
    if (property.status === "reserved" || property.status === "occupied") {
      return next(
        new AppError(
          409,
          `The status of a ${property.status} property cannot be changed here`,
        ),
      );
    }

    if (status === property.status) {
      return res.status(200).json({ success: true, data: property });
    }

    if (status === "available") {
      const live = await canGoLive(property);
      if (!live.ok) return next(new AppError(409, live.reason));
    }

    const [updated] = await db
      .update(properties)
      .set({ status })
      .where(eq(properties.id, id))
      .returning();

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

// ─── Images ───────────────────────────────────────────────────────────────────

// POST /properties/:id/images  (multipart/form-data, field "images")
export async function uploadPropertyImages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as PropertyIdParams;
    const files = req.files as Express.Multer.File[]; // non-empty and type-checked by handleImageUpload

    const property = await loadManagedProperty(requester, id);
    if (!property) return next(new AppError(404, "Property not found"));

    const [stats] = await db
      .select({ total: count(), last: max(propertyImages.sort_order) })
      .from(propertyImages)
      .where(eq(propertyImages.property_id, id));
    const existing = stats?.total ?? 0;

    if (existing + files.length > MAX_IMAGES_PER_PROPERTY) {
      return next(
        new AppError(
          400,
          `A property can have at most ${MAX_IMAGES_PER_PROPERTY} images (it has ${existing})`,
        ),
      );
    }

    // Upload all; if any fail, remove the ones that succeeded so Cloudinary
    // doesn't keep files no row points to
    const results = await Promise.allSettled(
      files.map((f) => uploadImage(f.buffer, `habipay/properties/${id}`)),
    );
    const uploaded = results
      .filter(
        (r): r is PromiseFulfilledResult<UploadedImage> =>
          r.status === "fulfilled",
      )
      .map((r) => r.value);

    if (uploaded.length !== files.length) {
      await Promise.allSettled(uploaded.map((u) => deleteImage(u.public_id)));
      return next(new AppError(502, "Image upload failed. Please try again"));
    }

    const [cover] = await db
      .select({ id: propertyImages.id })
      .from(propertyImages)
      .where(
        and(
          eq(propertyImages.property_id, id),
          eq(propertyImages.is_cover, true),
        ),
      )
      .limit(1);
    const firstOrder = (stats?.last ?? -1) + 1;

    try {
      const rows = await db
        .insert(propertyImages)
        .values(
          uploaded.map((u, i) => ({
            property_id: id,
            storage_key: u.public_id,
            url: u.secure_url,
            width: u.width,
            height: u.height,
            bytes: u.bytes,
            sort_order: firstOrder + i,
            // The first photo a property ever gets becomes its cover
            is_cover: !cover && i === 0,
          })),
        )
        .returning();

      return res.status(201).json({ success: true, data: rows });
    } catch (err) {
      // Database write failed after upload: remove the files, then report the error
      await Promise.allSettled(uploaded.map((u) => deleteImage(u.public_id)));
      throw err;
    }
  } catch (err) {
    return next(err);
  }
}

// PATCH /properties/:id/images — reorder the gallery and optionally change the cover
export async function reorderPropertyImages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as PropertyIdParams;
    const { order, cover_image_id } = req.body as ReorderImagesInput;

    const property = await loadManagedProperty(requester, id);
    if (!property) return next(new AppError(404, "Property not found"));

    const current = await db
      .select({ id: propertyImages.id })
      .from(propertyImages)
      .where(eq(propertyImages.property_id, id));
    const currentIds = new Set(current.map((i) => i.id));

    // The new order must list exactly this property's images: none missing, none foreign
    if (
      order.length !== currentIds.size ||
      !order.every((imageId) => currentIds.has(imageId))
    ) {
      return next(
        new AppError(
          400,
          "order must list every image of this property exactly once",
        ),
      );
    }
    if (cover_image_id && !currentIds.has(cover_image_id)) {
      return next(
        new AppError(
          400,
          "cover_image_id must be one of this property's images",
        ),
      );
    }

    await db.transaction(async (tx) => {
      for (const [index, imageId] of order.entries()) {
        await tx
          .update(propertyImages)
          .set({ sort_order: index })
          .where(eq(propertyImages.id, imageId));
      }
      if (cover_image_id) {
        // Unset first, then set: only one cover may exist at any moment (unique index)
        await tx
          .update(propertyImages)
          .set({ is_cover: false })
          .where(eq(propertyImages.property_id, id));
        await tx
          .update(propertyImages)
          .set({ is_cover: true })
          .where(eq(propertyImages.id, cover_image_id));
      }
    });

    const images = await getPropertyImages(id);
    return res.status(200).json({ success: true, data: images });
  } catch (err) {
    return next(err);
  }
}

// DELETE /properties/:id/images/:imageId
export async function deletePropertyImage(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id, imageId } = res.locals.params as PropertyImageParams;

    const property = await loadManagedProperty(requester, id);
    if (!property) return next(new AppError(404, "Property not found"));

    const [image] = await db
      .select()
      .from(propertyImages)
      .where(
        and(eq(propertyImages.id, imageId), eq(propertyImages.property_id, id)),
      )
      .limit(1);
    if (!image) return next(new AppError(404, "Image not found"));

    const delisted = await db.transaction(async (tx) => {
      await tx.delete(propertyImages).where(eq(propertyImages.id, imageId));
      if (!image.is_cover) return false;

      // The cover was removed: promote the next photo in the gallery
      const [nextCover] = await tx
        .select({ id: propertyImages.id })
        .from(propertyImages)
        .where(eq(propertyImages.property_id, id))
        .orderBy(asc(propertyImages.sort_order), asc(propertyImages.created_at))
        .limit(1);

      if (nextCover) {
        await tx
          .update(propertyImages)
          .set({ is_cover: true })
          .where(eq(propertyImages.id, nextCover.id));
        return false;
      }

      // No photos left: a live listing can't stay live without a cover
      if (property.status === "available") {
        await tx
          .update(properties)
          .set({ status: "pending" })
          .where(eq(properties.id, id));
        return true;
      }
      return false;
    });

    // After the database commit. If Cloudinary fails, a stray file is the lesser
    // problem than a listing pointing at a deleted photo
    try {
      await deleteImage(image.storage_key);
    } catch {
      console.error(`Cloudinary delete failed for image ${image.id}`);
    }

    return res.status(200).json({
      success: true,
      data: { deleted: image.id, property_delisted: delisted },
    });
  } catch (err) {
    return next(err);
  }
}
