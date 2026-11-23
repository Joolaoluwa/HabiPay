import { Request, Response, NextFunction } from "express";
import { and, count, desc, eq, inArray, SQL } from "drizzle-orm";
import { TokenPayload } from "../auth/auth.service";
import { db } from "../../config/db";
import { landlordReferrals } from "../../db/schema/landlord-referral";
import { AppError } from "../../utils/appresponse";
import { pageMeta } from "../../utils/validators";
import { getTenantProfileForUser } from "../tenants/tenant.service";
import {
  CreateReferralInput,
  ListReferralsQuery,
  ReferralIdParams,
  UpdateReferralInput,
} from "./referrals.types";
import {
  OPEN_STATUSES,
  canTransition,
  forTenant,
  linkOnboardedReferral,
  resolvedAtFor,
} from "./referrals.service";

// POST /referrals (tenant)
export async function createReferral(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const body = req.body as CreateReferralInput;

    const tenant = await getTenantProfileForUser(requester.id);
    if (!tenant) {
      return next(
        new AppError(
          403,
          "Create your tenant profile before referring a landlord",
        ),
      );
    }

    // The phone is normalised (+234...), so the same number in any format matches
    const [duplicate] = await db
      .select({ id: landlordReferrals.id })
      .from(landlordReferrals)
      .where(
        and(
          eq(landlordReferrals.referred_by_tenant_id, tenant.id),
          eq(landlordReferrals.landlord_phone, body.landlord_phone),
          inArray(landlordReferrals.status, OPEN_STATUSES),
        ),
      )
      .limit(1);
    if (duplicate) {
      return next(
        new AppError(
          409,
          "You already have an open referral for this landlord",
        ),
      );
    }

    const [created] = await db
      .insert(landlordReferrals)
      .values({
        ...body,
        referred_by_tenant_id: tenant.id, // always from the token, never from the body
      })
      .returning();

    if (!created) return next(new AppError(500, "Could not create referral"));

    return res.status(201).json({ success: true, data: forTenant(created) });
  } catch (err) {
    return next(err);
  }
}

// GET /referrals — tenants see their own, admins see all
export async function listReferrals(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const isAdmin = requester.role === "admin";
    const q = res.locals.query as ListReferralsQuery;

    const conditions: (SQL | undefined)[] = [];

    if (!isAdmin) {
      const tenant = await getTenantProfileForUser(requester.id);
      if (!tenant) {
        return res
          .status(200)
          .json({
            success: true,
            data: [],
            pagination: pageMeta(q.page, q.limit, 0),
          });
      }
      conditions.push(eq(landlordReferrals.referred_by_tenant_id, tenant.id));
    }
    if (q.status) conditions.push(eq(landlordReferrals.status, q.status));

    const where = and(...conditions);
    const offset = (q.page - 1) * q.limit;

    const [rows, [totalRow]] = await Promise.all([
      db
        .select()
        .from(landlordReferrals)
        .where(where)
        .orderBy(desc(landlordReferrals.created_at), desc(landlordReferrals.id))
        .limit(q.limit)
        .offset(offset),
      db.select({ total: count() }).from(landlordReferrals).where(where),
    ]);

    return res.status(200).json({
      success: true,
      data: isAdmin ? rows : rows.map(forTenant),
      pagination: pageMeta(q.page, q.limit, totalRow?.total ?? 0),
    });
  } catch (err) {
    return next(err);
  }
}

// GET /referrals/:id
export async function getReferralById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const isAdmin = requester.role === "admin";
    const { id } = res.locals.params as ReferralIdParams;

    const [referral] = await db
      .select()
      .from(landlordReferrals)
      .where(eq(landlordReferrals.id, id))
      .limit(1);

    if (!referral) return next(new AppError(404, "Referral not found"));

    if (!isAdmin) {
      const tenant = await getTenantProfileForUser(requester.id);
      // Not found and not yours look the same, so ids can't be probed
      if (!tenant || referral.referred_by_tenant_id !== tenant.id) {
        return next(new AppError(404, "Referral not found"));
      }
    }

    return res
      .status(200)
      .json({ success: true, data: isAdmin ? referral : forTenant(referral) });
  } catch (err) {
    return next(err);
  }
}

// PATCH /referrals/:id (admin)
export async function updateReferral(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const requester = req.user as TokenPayload;
    const { id } = res.locals.params as ReferralIdParams;
    const body = req.body as UpdateReferralInput;

    const [referral] = await db
      .select()
      .from(landlordReferrals)
      .where(eq(landlordReferrals.id, id))
      .limit(1);

    if (!referral) return next(new AppError(404, "Referral not found"));

    if (!canTransition(referral.status, body.status)) {
      return next(
        new AppError(
          409,
          `A referral cannot move from ${referral.status} to ${body.status}`,
        ),
      );
    }

    const updated = await db.transaction(async (tx) => {
      if (body.status === "onboarded") {
        // The schema guarantees both ids are present when onboarding
        await linkOnboardedReferral(
          tx,
          referral.id,
          body.landlord_id as string,
          body.property_id as string,
        );
      }

      const [row] = await tx
        .update(landlordReferrals)
        .set({
          status: body.status,
          landlord_id: body.landlord_id,
          property_id: body.property_id,
          handled_by: requester.id, // the admin who made this change
          resolved_at: resolvedAtFor(body.status),
        })
        .where(eq(landlordReferrals.id, id))
        .returning();
      return row;
    });

    if (!updated) return next(new AppError(404, "Referral not found"));

    // TODO (notifications phase): tell the tenant their referral moved on

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    // A landlord_id that doesn't exist fails the foreign key
    if ((err as any)?.cause?.code === "23503") {
      return next(new AppError(400, "Landlord not found"));
    }
    return next(err);
  }
}
