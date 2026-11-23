import { z } from "zod";

// ─── Money ────────────────────────────────────────────────────────────────────
// Arrives as a number or a string, is checked as a string, and stays a string,
// because Drizzle reads and writes decimal columns as strings.
// Checking the text avoids float errors: 150000.555 is rejected instead of being
// silently rounded by Postgres, and 0.1 + 0.2 is rejected instead of stored.
export const money = (max?: number) =>
  z
    .union([z.number(), z.string().trim()])
    .transform(String)
    .pipe(
      z.string().regex(/^\d{1,13}(\.\d{1,2})?$/, "Must be a positive amount with at most 2 decimal places"),
    )
    .refine((v) => Number(v) > 0, "Must be greater than zero")
    .refine((v) => max === undefined || Number(v) <= max, `Must not exceed ${max}`);

// ─── Nigerian phone numbers ───────────────────────────────────────────────────
// Accepts 08012345678, 0801 234 5678, 2348012345678 and +2348012345678.
// Always stored as +2348012345678, so duplicates can be compared reliably.
export const ngPhone = z
  .string()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^(\+?234|0)[789][01]\d{8}$/, "Enter a valid Nigerian phone number"))
  .transform((v) => "+234" + v.replace(/^(\+?234|0)/, ""));

// ─── Text ─────────────────────────────────────────────────────────────────────
export const requiredText = (max: number) => z.string().trim().min(1, "Required").max(max);

// ─── Pagination ───────────────────────────────────────────────────────────────
// Spread into a query schema: z.object({ ...paginationFields, ... })
// Query values arrive as strings, so numbers are coerced
export const paginationFields = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .default(20)
    .transform((n) => Math.min(n, 100)), // capped, not rejected
};

export const pageMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  total_pages: Math.ceil(total / limit),
});
