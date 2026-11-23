import { eq } from "drizzle-orm";
import { db } from "../../config/db";
import {
  tenantProfiles,
  EmploymentStatus,
  TenantCheck,
  TenantProfile,
} from "../../db/schema/tenant-profiles";
// `import type` is erased at compile time. tenant.types.ts imports this file at
// runtime, so a normal import here would make the two files load each other
import type { TenantVerificationInput, UpdateTenantInput } from "./tenant.types";

// ─── Lookups ──────────────────────────────────────────────────────────────────

// The caller's tenant profile id, or undefined if they haven't created one.
// Used by properties (referral visibility) and referrals
export async function getTenantProfileForUser(userId: string) {
  const [profile] = await db
    .select({ id: tenantProfiles.id })
    .from(tenantProfiles)
    .where(eq(tenantProfiles.user_id, userId))
    .limit(1);
  return profile;
}

// ─── Summary rule ─────────────────────────────────────────────────────────────

// One rejection fails the profile; all three must pass to verify
export function deriveVerificationStatus(checks: TenantCheck[]): TenantCheck {
  if (checks.includes("rejected")) return "rejected";
  if (checks.every((c) => c === "verified")) return "verified";
  if (checks.includes("pending")) return "pending";
  return "unverified";
}

// ─── Evidence per employment status (used by documents and admin review) ──────

type Evidence = { employment: string[]; income: string[] };

export const REQUIRED_EVIDENCE: Partial<Record<EmploymentStatus, Evidence>> = {
  employed: { employment: ["employment_letter"], income: ["bank_statement"] },
  contract: { employment: ["contract_agreement"], income: ["bank_statement"] },
  self_employed: { employment: ["business_registration"], income: ["bank_statement"] },
  // unemployed, student: no path to verification yet (founder decision)
};

export const canBeVerified = (status: EmploymentStatus) => status in REQUIRED_EVIDENCE;

// ─── Required fields per employment status ────────────────────────────────────

type FieldRule = "required" | "optional" | "forbidden";
const EMPLOYMENT_FIELDS = [
  "employer_name",
  "employer_rc_number",
  "monthly_income",
  "salary_payment_bank",
] as const;
type EmploymentField = (typeof EMPLOYMENT_FIELDS)[number];

// Record, not Partial: a new employment status won't compile until it has rules
export const EMPLOYMENT_FIELD_RULES: Record<EmploymentStatus, Record<EmploymentField, FieldRule>> = {
  employed:      { employer_name: "required",  employer_rc_number: "optional",  monthly_income: "required", salary_payment_bank: "required" },
  contract:      { employer_name: "required",  employer_rc_number: "optional",  monthly_income: "required", salary_payment_bank: "required" },
  self_employed: { employer_name: "required",  employer_rc_number: "required",  monthly_income: "required", salary_payment_bank: "required" },
  student:       { employer_name: "forbidden", employer_rc_number: "forbidden", monthly_income: "optional", salary_payment_bank: "optional" },
  unemployed:    { employer_name: "forbidden", employer_rc_number: "forbidden", monthly_income: "optional", salary_payment_bank: "optional" },
};

const present = (v: unknown) => v !== undefined && v !== null && v !== "";

// body: what the request sends. current: the stored profile (omit on create)
export function resolveEmploymentFields(
  status: EmploymentStatus,
  body: Partial<Record<EmploymentField, unknown>>,
  current?: Partial<Record<EmploymentField, unknown>>,
) {
  const rules = EMPLOYMENT_FIELD_RULES[status];
  const missing: EmploymentField[] = [];
  const notAllowed: EmploymentField[] = [];
  const clear: Partial<Record<EmploymentField, null>> = {};

  for (const field of EMPLOYMENT_FIELDS) {
    const sent = present(body[field]);
    const stored = present(current?.[field]);

    if (rules[field] === "forbidden") {
      if (sent) notAllowed.push(field);      // explicitly sent: reject
      else if (stored) clear[field] = null;  // left over from an old status: clear it
    }
    if (rules[field] === "required" && !sent && !stored) missing.push(field);
  }

  return { missing, notAllowed, clear };
}

// ─── Which checks a tenant's edit resets ──────────────────────────────────────

const changed = (next: unknown, current: unknown) => next !== undefined && next !== current;
const moneyChanged = (next: unknown, current: string | null) =>
  next !== undefined && Number(next) !== Number(current);

export function verificationAfterEdit(current: TenantProfile, body: UpdateTenantInput) {
  // Changing who you work for invalidates both the employment and income evidence
  const employmentChanged =
    changed(body.employment_status, current.employment_status) ||
    changed(body.employer_name, current.employer_name) ||
    changed(body.employer_rc_number, current.employer_rc_number);

  const incomeChanged =
    employmentChanged ||
    moneyChanged(body.monthly_income, current.monthly_income) ||
    changed(body.salary_payment_bank, current.salary_payment_bank);

  const identity_check = current.identity_check; // never touched by a profile edit
  const employment_check: TenantCheck = employmentChanged ? "unverified" : current.employment_check;
  const income_check: TenantCheck = incomeChanged ? "unverified" : current.income_check;

  return {
    employment_check,
    income_check,
    verification_status: deriveVerificationStatus([identity_check, employment_check, income_check]),
    // null clears the column; undefined leaves it alone
    verified_monthly_income: incomeChanged ? null : undefined,
  };
}

// ─── An admin's review ────────────────────────────────────────────────────────

type ReviewResult =
  | { error: string }
  | {
      values: {
        identity_check: TenantCheck;
        employment_check: TenantCheck;
        income_check: TenantCheck;
        verification_status: TenantCheck;
        verified_monthly_income: string | null;
        verification_reason: string | null;
      };
    };

export function verificationAfterReview(
  current: TenantProfile,
  body: TenantVerificationInput,
): ReviewResult {
  const identity_check = body.identity_check ?? current.identity_check;
  const employment_check = body.employment_check ?? current.employment_check;
  const income_check = body.income_check ?? current.income_check;

  // Statuses with no evidence path (student, unemployed) can't pass work checks
  if (
    (employment_check === "verified" || income_check === "verified") &&
    !canBeVerified(current.employment_status)
  ) {
    return {
      error: `Employment and income cannot be verified for ${current.employment_status} tenants yet`,
    };
  }

  // The tenant needs to know why, and the profile shows them this note
  const rejecting = [body.identity_check, body.employment_check, body.income_check].includes(
    "rejected",
  );
  if (rejecting && !body.reason) {
    return { error: "A reason is required when rejecting a check" };
  }

  if (body.verified_monthly_income !== undefined && income_check !== "verified") {
    return {
      error: "verified_monthly_income can only be recorded together with a verified income check",
    };
  }

  // Risk evaluation reads this figure, so a verified income check must carry one
  const verified_monthly_income =
    income_check === "verified"
      ? (body.verified_monthly_income ?? current.verified_monthly_income)
      : null;
  if (income_check === "verified" && !verified_monthly_income) {
    return { error: "Record verified_monthly_income when verifying income" };
  }

  return {
    values: {
      identity_check,
      employment_check,
      income_check,
      verification_status: deriveVerificationStatus([identity_check, employment_check, income_check]),
      verified_monthly_income,
      // Each review replaces the note, so an old rejection reason never outlives a re-review
      verification_reason: body.reason ?? null,
    },
  };
}
