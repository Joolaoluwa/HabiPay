import { z } from "zod";

export const createLandlordSchema = z
  .object({
    bank_name: z.string().trim().min(2, "Bank name is required").max(100),
    bank_account_number: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "Account number must be exactly 10 digits"),
    account_name: z.string().trim().min(2, "Account name is required").max(150),
  })

export const validateLandlordSchema = z.
object({
  id: z.string().uuid()
})

export const updateLandlordSchema = z
  .object({
    bank_name: z.string().trim().min(2, "Bank name is required").max(100).optional(),
    bank_account_number: z
      .string()
      .trim()
      .regex(/^\d{10}$/, "Account number must be exactly 10 digits").optional(),
    account_name: z.string().trim().min(2, "Account name is required").max(150).optional(),
    verification_status: z.enum(['unverified', 'pending', 'verified', 'rejected'], "verification only exists withing the bounds of verified, pending, rejected and unverified").optional()
  }).strict()

enum Verify{
  Unverified = "unverified", 
  Pending = "pending",
  Verified = "verified",
  Rejected = "rejected"
}
export type landLordType = {
    bank_name: string,
    account_name: string,
    bank_account_number: string,
    verification_status: Verify
}
export type updateLandlordBody = z.infer<typeof updateLandlordSchema>;
export type CreateLandlordBody = z.infer<typeof createLandlordSchema>;
export type validateLandlordBody = z.infer<typeof validateLandlordSchema>;