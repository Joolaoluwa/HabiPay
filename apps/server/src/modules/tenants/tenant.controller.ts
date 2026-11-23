import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { TokenPayload } from "../auth/auth.service";
import { db } from "../../config/db";
import { tenantProfiles } from "../../db/schema/tenant-profiles";
import { AppError } from "../../utils/appresponse";
import {
  CreateTenantInput,
  TenantId,
  TenantVerificationInput,
  UpdateTenantInput,
  profileColumns,
} from "./tenant.types";
import {
  resolveEmploymentFields,
  verificationAfterEdit,
  verificationAfterReview,
} from "./tenant.service";

// POST /tenants
export async function createTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = req.user as TokenPayload;
    // The employment rules were already checked by createTenantSchema's superRefine
    const {
      employment_status,
      employer_name,
      employer_rc_number,
      monthly_income,
      salary_payment_bank,
      residential_address,
    } = req.body as CreateTenantInput;

    const [existing] = await db
      .select({ id: tenantProfiles.id })
      .from(tenantProfiles)
      .where(eq(tenantProfiles.user_id, requester.id))
      .limit(1);

    if (existing) {
      return next(new AppError(409, "You already have a tenant profile"));
    }

    const [created] = await db
      .insert(tenantProfiles)
      .values({
        user_id: requester.id, // always from the token, never from the body
        employment_status,
        employer_name,
        employer_rc_number, // already normalised by the schema, e.g. "RC1234567"
        monthly_income, // already a validated string (or undefined) from money()
        salary_payment_bank,
        residential_address,
        // The checks, verification_status and verified_monthly_income
        // all start from their column defaults
      })
      .returning(profileColumns);

    if (!created) return next(new AppError(500, "Could not create profile"));

    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    // Two simultaneous requests can both pass the check above; the unique constraint catches the second
    if ((err as any)?.cause?.code === "23505") {
      return next(new AppError(409, "You already have a tenant profile"));
    }
    return next(err);
  }
}

// GET /tenants/me
export async function getMyTenant(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = req.user as TokenPayload;

    const [profile] = await db
      .select(profileColumns)
      .from(tenantProfiles)
      .where(eq(tenantProfiles.user_id, requester.id))
      .limit(1);

    if (!profile) return next(new AppError(404, "You have not created a tenant profile yet"));

    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    return next(err);
  }
}

// GET /tenants/:id
export async function getTenantById(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as TenantId;

    const [profile] = await db
      .select(profileColumns)
      .from(tenantProfiles)
      .where(eq(tenantProfiles.id, id))
      .limit(1);

    // Not found and not yours look the same, so ids can't be probed
    if (!profile || (requester.role !== "admin" && profile.user_id !== requester.id)) {
      return next(new AppError(404, "Tenant profile not found"));
    }

    return res.status(200).json({ success: true, data: profile });
  } catch (err) {
    return next(err);
  }
}

// PUT /tenants/:id
export async function updateTenantById(req: Request, res: Response, next: NextFunction) {
  try {
    const requester = req.user as TokenPayload;
    const isAdmin = requester.role === "admin";
    const { id } = res.locals.params as TenantId;
    const body = req.body as UpdateTenantInput; // never empty: the schema rejects {}

    // Full row: the rules below compare new values with stored ones
    const [profile] = await db
      .select()
      .from(tenantProfiles)
      .where(eq(tenantProfiles.id, id))
      .limit(1);

    if (!profile || (!isAdmin && profile.user_id !== requester.id)) {
      return next(new AppError(404, "Tenant profile not found"));
    }

    // Check the profile as it will look after the edit, not just the body
    const employment_status = body.employment_status ?? profile.employment_status;
    const { missing, notAllowed, clear } = resolveEmploymentFields(employment_status, body, profile);

    if (notAllowed.length > 0) {
      return next(
        new AppError(400, `Not allowed when employment status is ${employment_status}: ${notAllowed.join(", ")}`),
      );
    }
    if (missing.length > 0) {
      return next(
        new AppError(400, `Required when employment status is ${employment_status}: ${missing.join(", ")}`),
      );
    }

    const [updated] = await db
      .update(tenantProfiles)
      .set({
        employment_status: body.employment_status,
        employer_name: body.employer_name,
        employer_rc_number: body.employer_rc_number,
        monthly_income: body.monthly_income, // validated string or undefined
        salary_payment_bank: body.salary_payment_bank,
        residential_address: body.residential_address,
        ...clear, // fields left over from an old employment status become null
        ...verificationAfterEdit(profile, body),
        // updated_at is set by $onUpdate in the schema
      })
      .where(eq(tenantProfiles.id, id))
      .returning(profileColumns);

    if (!updated) return next(new AppError(404, "Tenant profile not found"));

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}

// PATCH /tenants/:id/verification (admin only)
export async function reviewTenantVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = res.locals.params as TenantId;
    const body = req.body as TenantVerificationInput;

    const [profile] = await db
      .select()
      .from(tenantProfiles)
      .where(eq(tenantProfiles.id, id))
      .limit(1);

    if (!profile) return next(new AppError(404, "Tenant profile not found"));

    const result = verificationAfterReview(profile, body);
    if ("error" in result) return next(new AppError(400, result.error));

    const [updated] = await db
      .update(tenantProfiles)
      .set(result.values)
      .where(eq(tenantProfiles.id, id))
      .returning(profileColumns);

    if (!updated) return next(new AppError(404, "Tenant profile not found"));

    // TODO (admin phase): write an admin_actions row with the before and after checks

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    return next(err);
  }
}
