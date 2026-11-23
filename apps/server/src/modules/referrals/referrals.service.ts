import { and, eq, ne } from "drizzle-orm";
import { landlords } from "../../db/schema/landlords";
import { properties } from "../../db/schema/properties";
import {
  landlordReferrals,
  LandlordReferral,
} from "../../db/schema/landlord-referral";
import { AppError } from "../../utils/appresponse";
import type { Tx } from "../properties/properties.service";

type ReferralStatus = LandlordReferral["status"];

// ─── Status flow ──────────────────────────────────────────────────────────────
// submitted   → contacted, declined, unreachable
// contacted   → onboarded, declined, unreachable
// unreachable → contacted (the admin got through later), declined
// onboarded and declined are final
const ALLOWED: Record<ReferralStatus, ReferralStatus[]> = {
  submitted: ["contacted", "declined", "unreachable"],
  contacted: ["onboarded", "declined", "unreachable"],
  unreachable: ["contacted", "declined"],
  onboarded: [],
  declined: [],
};

export const canTransition = (from: ReferralStatus, to: ReferralStatus) =>
  ALLOWED[from].includes(to);

// Open referrals block a duplicate submission for the same landlord phone
export const OPEN_STATUSES: ReferralStatus[] = ["submitted", "contacted"];

// When the referral reached a resolved state. Starts the contact-details
// retention clock for declined and unreachable ones.
// undefined leaves the column alone; null clears it (unreachable → contacted reopens it)
export function resolvedAtFor(status: ReferralStatus): Date | null | undefined {
  if (
    status === "onboarded" ||
    status === "declined" ||
    status === "unreachable"
  )
    return new Date();
  if (status === "contacted") return null;
  return undefined;
}

// ─── Onboarding ───────────────────────────────────────────────────────────────

// Links a referral to the landlord and property the admin onboarded.
// Runs inside the same transaction as the referral update, so either all of
// it happens or none of it does
export async function linkOnboardedReferral(
  tx: Tx,
  referralId: string,
  landlordId: string,
  propertyId: string,
) {
  const [property] = await tx
    .select({ id: properties.id, landlord_id: properties.landlord_id })
    .from(properties)
    .where(eq(properties.id, propertyId))
    .limit(1);

  if (!property) throw new AppError(400, "Property not found");
  if (property.landlord_id !== landlordId) {
    throw new AppError(400, "That property does not belong to that landlord");
  }

  const [taken] = await tx
    .select({ id: landlordReferrals.id })
    .from(landlordReferrals)
    .where(
      and(
        eq(landlordReferrals.property_id, propertyId),
        ne(landlordReferrals.id, referralId),
      ),
    )
    .limit(1);
  if (taken)
    throw new AppError(
      409,
      "That property is already linked to another referral",
    );

  // Hidden from the marketplace: only the referring tenant, the owner and admins see it
  await tx
    .update(properties)
    .set({ listing_type: "referral" })
    .where(eq(properties.id, propertyId));
  // For reporting: how this landlord came to HabiPay
  await tx
    .update(landlords)
    .set({ source: "tenant_referred" })
    .where(eq(landlords.id, landlordId));
}

// ─── Response shape ───────────────────────────────────────────────────────────

// Tenants see what they submitted and its progress, but not which admin handled it
export function forTenant(referral: LandlordReferral) {
  const { handled_by: _handledBy, ...rest } = referral;
  return rest;
}
