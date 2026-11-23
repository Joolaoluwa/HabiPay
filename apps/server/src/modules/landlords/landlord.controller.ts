import { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import { landlords, users } from "../../db/schema";
import {
  CreateLandlordBody,
  validateLandlordBody,
  updateLandlordBody,
  AdminId,
} from "./landlord.types";
import { TokenPayload } from "../auth/auth.service";
import {
  encryptField,
  decryptField,
  maskIdNumber,
  accountContext,
} from "../../utils/encryption";
import { AppError } from "../../utils/appresponse";
import { resolveBankAccount } from "./landlord.service";
import { namesMatch } from "../../utils/names-match";

export async function CreateLandlord(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { bank_name, bank_account_number, account_name, bank_code } =
    req.body as CreateLandlordBody;
  const requester = req.user as TokenPayload;
  const userId = requester.id!;

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const [existing] = await db
      .select({ id: landlords.id })
      .from(landlords)
      .where(eq(landlords.user_id, userId))
      .limit(1);

    if (existing) {
      return res
        .status(409)
        .json({ success: false, message: "Landlord record already exists" });
    }
    const encryptAccountNumber = encryptField(
      bank_account_number,
      accountContext(userId),
    );
    const [created] = await db
      .insert(landlords)
      .values({
        user_id: userId,
        bank_name: bank_name,
        bank_account_number: encryptAccountNumber,
        account_name: account_name,
        bank_code: bank_code,
      })
      .returning();

    const data = {
      id: created!.id,
      user_id: created!.user_id,
      full_name: user.full_name,
      email: user.email,
      phone_number: user.phone_number,
      bank_name: created!.bank_name,
      account_name: created!.account_name,
      bank_code: bank_code,
    };

    return res.status(201).json({ success: true, data });
  } catch (err: any) {
    // Unique constraint on landlords.user_id (two requests racing)
    if (err?.code === "23505") {
      return res
        .status(409)
        .json({ success: false, message: "Landlord record already exists" });
    }
    return next(err);
  }
}

export async function getLandlordById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { id } = req.params as validateLandlordBody;
  const requester = req.user as TokenPayload;
  const userId = requester.id!;
  console.log(requester.role);
  if (!id) {
    throw new AppError(400, "Invalid request parameter");
  }

  try {
    const [row] = await db
      .select({
        id: landlords.id,
        user_id: landlords.user_id,
        bank_name: landlords.bank_name,
        bank_account_number: landlords.bank_account_number, // encrypted, masked below
        account_name: landlords.account_name,
        verification_status: landlords.verification_status,
        bank_code: landlords.bank_code,
        created_at: landlords.created_at,
        updated_at: landlords.updated_at,
        full_name: users.full_name,
        email: users.email,
        phone_number: users.phone_number,
      })
      .from(landlords)
      .innerJoin(users, eq(landlords.user_id, users.id))
      .where(eq(landlords.id, id))
      .limit(1);

    if (!row) {
      return next(new AppError(404, "Landlord not found"));
    }

    // Ownership: the landlord themselves or an admin
    if (requester.role !== "admin" && row.user_id !== requester.id) {
      return next(new AppError(404, "Landlord not found"));
    }

    const accountNumber = decryptField(
      row.bank_account_number,
      accountContext(row.user_id),
    );

    return res.status(200).json({
      success: true,
      data: { ...row, bank_account_number: maskIdNumber(accountNumber) },
    });
  } catch (err) {
    return next(err);
  }
}

export async function updateLandlordById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  let {
    bank_name,
    bank_account_number,
    account_name,
    verification_status,
    bank_code,
  } = req.body as updateLandlordBody;

  const { id } = req.params as validateLandlordBody;
  const requester = req.user as TokenPayload;
  const userId = requester.id!;

  if (!id) {
    throw new AppError(400, "Invalid request parameter");
  }

  const [landlord] = await db
    .select({ id: landlords.id, user_id: landlords.user_id })
    .from(landlords)
    .where(eq(landlords.id, id))
    .limit(1);

  if (!landlord) {
    return next(new AppError(404, "Landlord not found"));
  }

  // 4. Ownership: the landlord themselves or an admin
  const isAdmin = requester.role === "admin";
  if (!isAdmin && landlord.user_id !== requester.id) {
    return next(new AppError(404, "Landlord not found"));
  }

  // 5. Field-level rule: only admins may set verification_status
  if (verification_status !== undefined && !isAdmin) {
    return next(
      new AppError(
        403,
        "You do not have permission to change verification status",
      ),
    );
  }

  // Bank details changed -> previous verification no longer applies
  const touchesBankDetails =
    bank_name !== undefined ||
    bank_account_number !== undefined ||
    account_name !== undefined ||
    bank_code !== undefined;

  if (touchesBankDetails && verification_status === undefined) {
    verification_status = "unverified";
  }

  // 7. Save
  const [updated] = await db
    .update(landlords)
    .set({
      bank_account_number:
        bank_account_number !== undefined
          ? encryptField(bank_account_number, accountContext(landlord.user_id))
          : undefined,
      bank_name: bank_name,
      account_name: account_name,
      verification_status: verification_status,
    })
    .where(eq(landlords.id, id))
    .returning({
      id: landlords.id,
      bank_name: landlords.bank_name,
      bank_account_number: landlords.bank_account_number,
      account_name: landlords.account_name,
      verification_status: landlords.verification_status,
      updated_at: landlords.updated_at,
    });

  if (!updated) return next(new AppError(404, "Landlord not found"));
  const accountNumber = decryptField(
    updated!.bank_account_number,
    accountContext(landlord.user_id),
  );

  return res.status(200).json({
    success: true,
    data: { ...updated, bank_account_number: maskIdNumber(accountNumber) },
  });
}

export async function verifyLandlord(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const { id } = req.params as AdminId;

  const requester = req.user as TokenPayload;
  const isAdmin = requester.role === "admin";
  try {
    const [landlord] = await db
      .select({
        id: landlords.id,
        user_id: landlords.user_id,
        bank_code: landlords.bank_code,
        bank_account_number: landlords.bank_account_number,
        account_name: landlords.account_name,
        verification_status: landlords.verification_status,
      })
      .from(landlords)
      .where(eq(landlords.id, id))
      .limit(1);

    if (!landlord) return next(new AppError(404, "Landlord not found"));

    if (!isAdmin && landlord.user_id !== requester.id) {
      return next(new AppError(404, "Landlord not found"));
    }

    if (landlord.verification_status === "verified") {
      return res.status(200).json({
        success: true,
        message: "Bank details are already verified",
        data: {
          id: landlord.id,
          verification_status: landlord.verification_status,
        },
      });
    }

    if (!landlord.bank_code) {
      return next(new AppError(400, "Add a bank code before verifying"));
    }

    // Decrypt the STORED value and send it to Paystack. Never log it.
    const accountNumber = decryptField(
      landlord.bank_account_number,
      accountContext(landlord.user_id),
    );

    const resolved = await resolveBankAccount(
      accountNumber,
      landlord.bank_code,
    );

    const status = namesMatch(landlord.account_name, resolved.account_name)
      ? "verified"
      : "pending";

    const [updated] = await db
      .update(landlords)
      .set({ verification_status: status, updated_at: new Date() })
      .where(eq(landlords.id, id))
      .returning({
        id: landlords.id,
        bank_name: landlords.bank_name,
        bank_code: landlords.bank_code,
        account_name: landlords.account_name,
        verification_status: landlords.verification_status,
        updated_at: landlords.updated_at,
      });

    if (!updated) return next(new AppError(404, "Landlord not found"));

    return res.status(200).json({
      success: true,
      message:
        status === "verified"
          ? "Bank details verified"
          : "The account name did not match. Your details have been sent for review.",
      data: updated,
    });
  } catch (err) {
    return next(err);
  }
}
