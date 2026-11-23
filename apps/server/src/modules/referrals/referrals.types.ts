import { z } from "zod";
import { propertyTypeEnum } from "../../db/schema/properties";
import { referralStatusEnum } from "../../db/schema/landlord-referral";
import {
  money,
  ngPhone,
  paginationFields,
  requiredText,
} from "../../utils/validators";

// ─── Body schemas ─────────────────────────────────────────────────────────────

// POST /referrals (tenant). The landlord's contact details plus the property
// the tenant wants financed. Name and phone are required here, even though the
// columns are nullable (so they can be cleared after the retention period)
export const createReferralSchema = z
  .object({
    landlord_full_name: z.string().trim().min(2).max(150),
    landlord_phone: ngPhone,
    landlord_email: z.string().trim().toLowerCase().email().max(255).optional(),

    property_address: requiredText(500),
    city: requiredText(100),
    state: requiredText(100),
    property_type: z.enum(propertyTypeEnum.enumValues).optional(),
    annual_rent: money().optional(), // what the tenant says the landlord charges
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

// PATCH /referrals/:id (admin). Moves the referral along. landlord_id and
// property_id are sent only when onboarding, and onboarding needs both
export const updateReferralSchema = z
  .object({
    status: z.enum(referralStatusEnum.enumValues),
    landlord_id: z.string().uuid().optional(),
    property_id: z.string().uuid().optional(),
  })
  .strict()
  .superRefine((b, ctx) => {
    const linking = b.landlord_id !== undefined || b.property_id !== undefined;
    if (b.status === "onboarded" && !(b.landlord_id && b.property_id)) {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "Onboarding needs both landlord_id and property_id",
      });
    }
    if (b.status !== "onboarded" && linking) {
      ctx.addIssue({
        code: "custom",
        path: ["landlord_id"],
        message: "landlord_id and property_id are only sent when onboarding",
      });
    }
  });

// ─── Query and params ─────────────────────────────────────────────────────────

export const listReferralsQuerySchema = z.object({
  ...paginationFields,
  status: z.enum(referralStatusEnum.enumValues).optional(),
});

export const referralIdParamSchema = z.object({
  id: z.string().uuid("Invalid referral id"),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type CreateReferralInput = z.infer<typeof createReferralSchema>;
export type UpdateReferralInput = z.infer<typeof updateReferralSchema>;
export type ListReferralsQuery = z.infer<typeof listReferralsQuerySchema>;
export type ReferralIdParams = z.infer<typeof referralIdParamSchema>;
