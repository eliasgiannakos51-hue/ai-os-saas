import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import { getProduct } from "@/lib/payments/products";
import { createPaymentLink, generateBuyButtonSnippet } from "@/lib/payments/payment-links";
import { getSiteUrl } from "@/lib/site-url";

/**
 * POST /api/payments/payment-links — create a Stripe Payment Link + buy button for a product.
 */

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) return NextResponse.json({ error: "no_account" }, { status: 400 });

    const body = await req.json();
    const productId = String(body.productId ?? "");
    if (!productId) return NextResponse.json({ error: "missing_product_id" }, { status: 400 });

    const product = await getProduct(admin, user.id, productId);
    if (!product) return NextResponse.json({ error: "product_not_found" }, { status: 404 });
    // Ownership: the product's user_id must match the caller's.
    if (product.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });

    // Create Stripe Payment Link.
    const result = await createPaymentLink({ account, product });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });

    // Generate embeddable buy button HTML.
    const snippet = generateBuyButtonSnippet({
      productId: product.id,
      productName: product.name,
      priceCents: product.price_cents,
      currency: product.currency,
      siteUrl: getSiteUrl(),
      buttonText: body.buttonText,
    });

    return NextResponse.json({
      paymentLinkUrl: result.url,
      paymentLinkId: result.linkId,
      buyButtonHtml: snippet,
      payPageUrl: `${getSiteUrl()}/pay/${product.id}`,
    });
  } catch (err) {
    logApiError("api/payments/payment-links:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
