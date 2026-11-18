import { env } from "../../config/env";
import { AppError } from "../../utils/appresponse";

type ResolvedAccount = { account_name: string; account_number: string; bank_id: number };

export async function resolveBankAccount(
  accountNumber: string,
  bankCode: string
): Promise<ResolvedAccount> {
  const url = new URL("https://api.paystack.co/bank/resolve");
  url.searchParams.set("account_number", accountNumber);
  url.searchParams.set("bank_code", bankCode);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${env.PAYSTACK_SK}` },
      signal: AbortSignal.timeout(10_000), // don't hang if Paystack is slow
    });
  } catch {
    throw new AppError(504, "Bank verification service is unreachable. Try again later.");
  }

  const body = (await response.json().catch(() => null)) as
    | { status: boolean; message: string; data?: ResolvedAccount }
    | null;

  if (response.ok && body?.status && body.data) {
    return body.data;
  }

  // Our key is wrong or missing: our problem, so log it and don't expose details
  if (response.status === 401 || response.status === 403) {
    console.error("Paystack auth failure:", response.status, body?.message);
    throw new AppError(500, "Bank verification is temporarily unavailable.");
  }

  if (response.status === 429) {
    throw new AppError(503, "Too many verification attempts. Try again shortly.");
  }

  // Other 4xx: account not found or unsupported bank (adjust after your Postman test)
  if (response.status >= 400 && response.status < 500) {
    throw new AppError(400, "Could not verify this account. Check the account number and bank.");
  }

  console.error("Paystack error:", response.status, body?.message);
  throw new AppError(502, "Bank verification failed. Try again later.");
}