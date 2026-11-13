import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { getProduct } from "@/lib/payments/products";
import { createPaymentCheckout } from "@/lib/payments/checkout";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/checkout — create a checkout session for a product.
 *
 * Body: { productId: string, customerEmail?: string, successUrl?: string, cancelUrl?: string }
 * Returns: { url: string }
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const limited = await checkRateLimit({
      scope: "payments_checkout",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const body = await req.json();
    const { productId, customerEmail, successUrl, cancelUrl } = body;

    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "product_id_required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) {
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }

    const product = await getProduct(admin, user.id, productId);
    if (!product || !product.is_active) {
      return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    }

    const result = await createPaymentCheckout({
      account,
      product,
      customerEmail: typeof customerEmail === "string" ? customerEmail : undefined,
      successUrl: typeof successUrl === "string" ? successUrl : undefined,
      cancelUrl: typeof cancelUrl === "string" ? cancelUrl : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ url: result.url, sessionId: result.sessionId });
  } catch (err) {
    logApiError("api/payments/checkout:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
