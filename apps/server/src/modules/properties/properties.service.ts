import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../../config/db";
import { landlords } from "../../db/schema/landlords";
import { Property } from "../../db/schema/properties";
import { amenities } from "../../db/schema/amenities";
import { propertyAmenities } from "../../db/schema/property-amenities";
import { propertyImages } from "../../db/schema/property-images";
import { landlordReferrals } from "../../db/schema/landlord-referral";
import { TokenPayload } from "../auth/auth.service";
import { getTenantProfileForUser } from "../tenants/tenant.service";
import type { AmenityInput } from "./properties.types";

// The type of `tx` inside db.transaction(async (tx) => ...)
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const MAX_IMAGES_PER_PROPERTY = 15;

// ─── Who the caller is ────────────────────────────────────────────────────────

// The caller's landlord record, or undefined if they haven't created one
export async function getLandlordForUser(userId: string) {
  const [landlord] = await db
    .select({
      id: landlords.id,
      verification_status: landlords.verification_status,
    })
    .from(landlords)
    .where(eq(landlords.user_id, userId))
    .limit(1);
  return landlord;
}

// Was this referral property brought in by this tenant?
export async function isReferredTo(
  tenantProfileId: string,
  propertyId: string,
) {
  const [row] = await db
    .select({ id: landlordReferrals.id })
    .from(landlordReferrals)
    .where(
      and(
        eq(landlordReferrals.property_id, propertyId),
        eq(landlordReferrals.referred_by_tenant_id, tenantProfileId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

// ─── Access rules ─────────────────────────────────────────────────────────────

// Can see: admin any; landlord their own; tenant available ones that are either
// on the marketplace or their own referral
export async function canViewProperty(
  requester: TokenPayload,
  property: Property,
) {
  if (requester.role === "admin") return true;

  if (requester.role === "landlord") {
    const landlord = await getLandlordForUser(requester.id);
    return landlord?.id === property.landlord_id;
  }

  if (requester.role === "tenant") {
    if (property.status !== "available") return false;
    if (property.listing_type === "marketplace") return true;
    const tenant = await getTenantProfileForUser(requester.id);
    return tenant ? isReferredTo(tenant.id, property.id) : false;
  }

  return false;
}

// Can change: admin any; landlord their own. Tenants never
export async function canManageProperty(
  requester: TokenPayload,
  property: Property,
) {
  if (requester.role === "admin") return true;
  if (requester.role !== "landlord") return false;
  const landlord = await getLandlordForUser(requester.id);
  return landlord?.id === property.landlord_id;
}

// Rent and lease length are locked while an application is submitted,
// under review or approved. The applications table doesn't exist yet.
// TODO (applications phase): query applications for those statuses
export async function hasActiveApplication(
  _propertyId: string,
): Promise<boolean> {
  return false;
}

// A property can go live only when the landlord can be paid and there's a cover photo
export async function canGoLive(
  property: Property,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const [landlord] = await db
    .select({ verification_status: landlords.verification_status })
    .from(landlords)
    .where(eq(landlords.id, property.landlord_id))
    .limit(1);

  if (landlord?.verification_status !== "verified") {
    return {
      ok: false,
      reason:
        "The landlord's bank details must be verified before this property can be listed",
    };
  }

  const [cover] = await db
    .select({ id: propertyImages.id })
    .from(propertyImages)
    .where(
      and(
        eq(propertyImages.property_id, property.id),
        eq(propertyImages.is_cover, true),
      ),
    )
    .limit(1);

  if (!cover) {
    return {
      ok: false,
      reason: "Add a cover photo before listing this property",
    };
  }

  return { ok: true };
}

// ─── Amenities ────────────────────────────────────────────────────────────────

// Turns codes into amenity ids. Unknown or retired codes come back in `unknown`
export async function resolveAmenities(codes: string[]) {
  if (codes.length === 0)
    return { byCode: new Map<string, string>(), unknown: [] as string[] };

  const rows = await db
    .select({ id: amenities.id, code: amenities.code })
    .from(amenities)
    .where(and(inArray(amenities.code, codes), eq(amenities.is_active, true)));

  const byCode = new Map(rows.map((r) => [r.code, r.id]));
  return { byCode, unknown: codes.filter((c) => !byCode.has(c)) };
}

// Replaces the whole amenity list. Run inside the same transaction as the property write
export async function replacePropertyAmenities(
  tx: Tx,
  propertyId: string,
  list: AmenityInput[],
  byCode: Map<string, string>,
) {
  await tx
    .delete(propertyAmenities)
    .where(eq(propertyAmenities.property_id, propertyId));
  if (list.length === 0) return;

  await tx.insert(propertyAmenities).values(
    list.map((a) => ({
      property_id: propertyId,
      amenity_id: byCode.get(a.code) as string, // every code was checked by resolveAmenities
      scope: a.scope,
      note: a.note,
    })),
  );
}

// ─── Response shapes ──────────────────────────────────────────────────────────

// Full detail for GET /properties/:id: amenities with labels, and the gallery in order
export async function getPropertyDetails(propertyId: string) {
  const [amenityRows, images] = await Promise.all([
    db
      .select({
        code: amenities.code,
        label: amenities.label,
        category: amenities.category,
        scope: propertyAmenities.scope,
        note: propertyAmenities.note,
      })
      .from(propertyAmenities)
      .innerJoin(amenities, eq(amenities.id, propertyAmenities.amenity_id))
      .where(eq(propertyAmenities.property_id, propertyId))
      .orderBy(asc(amenities.category), asc(amenities.label)),
    getPropertyImages(propertyId),
  ]);

  return { amenities: amenityRows, images };
}

export function getPropertyImages(propertyId: string) {
  return db
    .select()
    .from(propertyImages)
    .where(eq(propertyImages.property_id, propertyId))
    .orderBy(asc(propertyImages.sort_order), asc(propertyImages.created_at));
}

// Summary cards for GET /properties: the cover photo and amenity codes only.
// Two queries for the whole page, not two per property
export async function attachCardExtras(rows: Property[]) {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [covers, amenityRows] = await Promise.all([
    db
      .select({
        property_id: propertyImages.property_id,
        url: propertyImages.url,
      })
      .from(propertyImages)
      .where(
        and(
          inArray(propertyImages.property_id, ids),
          eq(propertyImages.is_cover, true),
        ),
      ),
    db
      .select({
        property_id: propertyAmenities.property_id,
        code: amenities.code,
      })
      .from(propertyAmenities)
      .innerJoin(amenities, eq(amenities.id, propertyAmenities.amenity_id))
      .where(inArray(propertyAmenities.property_id, ids)),
  ]);

  const coverBy = new Map(covers.map((c) => [c.property_id, c.url]));
  const codesBy = new Map<string, string[]>();
  for (const a of amenityRows) {
    const list = codesBy.get(a.property_id) ?? [];
    list.push(a.code);
    codesBy.set(a.property_id, list);
  }

  return rows.map((r) => ({
    ...r,
    cover_image_url: coverBy.get(r.id) ?? null,
    amenity_codes: codesBy.get(r.id) ?? [],
  }));
}
