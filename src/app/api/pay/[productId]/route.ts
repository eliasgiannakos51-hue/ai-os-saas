import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { createPaymentCheckout } from "@/lib/payments/checkout";
import type { PaymentsAccount } from "@/lib/payments/connect";
import type { PaymentsProduct } from "@/lib/payments/products";

export const dynamic = "force-dynamic";

/**
 * POST /api/pay/[productId] — PUBLIC, no auth.
 *
 * The customer (not an Ionexa user) clicks "Pay" on the public pay page.
 * We create a Stripe Checkout session and redirect them to it.
 *
 * Rate-limited per IP, not per user — there is no user.
 *
 * @service-role-justified public The product and its connected Stripe account
 * live in deny-all tables (payments_products, payments_accounts), so a
 * session-role client would see nothing. The admin client reads only
 * is_active, price, name, and the owner's stripe_account_id — never
 * anything the customer could not infer from the checkout page Stripe
 * renders. It writes nothing. The amount is fixed by the Stripe Price,
 * not by any request parameter, so a caller cannot alter what is charged.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const { productId } = await params;
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    const limited = await checkRateLimit({
      scope: "public_pay",
      identifier: ip,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const admin = createAdminClient();

    // Load the product and its account in one query.
    const { data: row } = await admin
      .from("payments_products")
      .select("*, payments_accounts!inner(*)")
      .eq("id", productId)
      .eq("is_active", true)
      .maybeSingle();

    if (!row || !row.payments_accounts?.charges_enabled) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const account = row.payments_accounts as unknown as PaymentsAccount;
    const product = row as unknown as PaymentsProduct;

    const result = await createPaymentCheckout({ account, product });
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }

    // Redirect the browser to Stripe Checkout.
    return NextResponse.redirect(result.url, 303);
  } catch (err) {
    logApiError("api/pay/[productId]:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
