import { z } from "zod";
import {
  employmentStatusEnum,
  tenantProfiles,
  tenantVerificationStatusEnum,
} from "../../db/schema";
import { money } from "../../utils/validators";
import { resolveEmploymentFields } from "./tenant.service";

// "rc-1234567", "RC 1234567" and "rc1234567" are all stored as "RC1234567".
// The prefix is kept because RC, BN and IT are separate registers at CAC
const rcNumber = z
  .string()
  .transform((v) => v.toUpperCase().replace(/[\s-]/g, ""))
  .pipe(
    z.string().regex(/^(RC|BN|IT)\d{1,8}$/, "Use the CAC format, e.g. RC1234567 or BN1234567"),
  );

// ─── Profile body schemas ─────────────────────────────────────────────────────

// Base field shapes only. Which fields are required, optional or forbidden
// depends on employment_status, and EMPLOYMENT_FIELD_RULES in tenant.service.ts decides
const tenantFields = z
  .object({
    employment_status: z.enum(employmentStatusEnum.enumValues),
    employer_name: z.string().trim().min(2).max(150).optional(),
    employer_rc_number: rcNumber.optional(),
    monthly_income: money(100_000_000).optional(),
    salary_payment_bank: z.string().trim().min(2).max(100).optional(),
    residential_address: z.string().trim().min(5).max(255),
  })
  .strict();

// Create: the whole profile arrives at once, so the rules are checked here
export const createTenantSchema = tenantFields.superRefine((data, ctx) => {
  const { missing, notAllowed } = resolveEmploymentFields(data.employment_status, data);
  for (const field of missing) {
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `Required when employment status is ${data.employment_status}`,
    });
  }
  for (const field of notAllowed) {
    ctx.addIssue({
      code: "custom",
      path: [field],
      message: `Not allowed when employment status is ${data.employment_status}`,
    });
  }
});

// Update: only changed fields arrive, so the rules are checked in the controller
// against the merged profile. No verification fields here, from anyone
export const updateTenantSchema = tenantFields
  .partial()
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: "Provide at least one field to update",
  });

// ─── Admin verification ───────────────────────────────────────────────────────

const check = z.enum(tenantVerificationStatusEnum.enumValues);

// PATCH /tenants/:id/verification (admin only)
export const tenantVerificationSchema = z
  .object({
    identity_check: check.optional(),
    employment_check: check.optional(),
    income_check: check.optional(),
    // The income the admin confirmed from bank statements
    verified_monthly_income: money(100_000_000).optional(),
    // Required when rejecting a check (enforced in the service)
    reason: z.string().trim().min(3).max(500).optional(),
  })
  .strict()
  .refine(
    (b) =>
      b.identity_check !== undefined ||
      b.employment_check !== undefined ||
      b.income_check !== undefined ||
      b.verified_monthly_income !== undefined,
    { message: "Provide at least one check to update" },
  );

// ─── Params ───────────────────────────────────────────────────────────────────

export const tenantIdParamSchema = z.object({
  id: z.string().uuid("Invalid tenant profile id"),
});

// ─── Inferred types ───────────────────────────────────────────────────────────

export type TenantId = z.infer<typeof tenantIdParamSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
export type TenantVerificationInput = z.infer<typeof tenantVerificationSchema>;

// ─── Response columns ─────────────────────────────────────────────────────────

// What a tenant sees of their own profile, including why a check is holding them up
export const profileColumns = {
  id: tenantProfiles.id,
  user_id: tenantProfiles.user_id,
  employment_status: tenantProfiles.employment_status,
  employer_name: tenantProfiles.employer_name,
  employer_rc_number: tenantProfiles.employer_rc_number,
  monthly_income: tenantProfiles.monthly_income,
  salary_payment_bank: tenantProfiles.salary_payment_bank,
  residential_address: tenantProfiles.residential_address,
  identity_check: tenantProfiles.identity_check,
  employment_check: tenantProfiles.employment_check,
  income_check: tenantProfiles.income_check,
  verification_status: tenantProfiles.verification_status,
  verification_reason: tenantProfiles.verification_reason,
  verified_monthly_income: tenantProfiles.verified_monthly_income,
  created_at: tenantProfiles.created_at,
  updated_at: tenantProfiles.updated_at,
};
