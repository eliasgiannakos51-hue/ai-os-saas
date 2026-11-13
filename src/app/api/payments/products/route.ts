import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { getPaymentsAccount } from "@/lib/payments/connect";
import {
  listProducts,
  createProduct,
  deactivateProduct,
  MIN_PRICE_CENTS,
  MAX_PRICE_CENTS,
} from "@/lib/payments/products";


export const dynamic = "force-dynamic";
/**
 * GET  /api/payments/products — list the user's products.
 * POST /api/payments/products — create a new product.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const admin = createAdminClient();
    const products = await listProducts(admin, user.id);
    return NextResponse.json({ products });
  } catch (err) {
    logApiError("api/payments/products:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const limited = await checkRateLimit({
      scope: "payments_products",
      identifier: user.id,
      maxAttempts: 30,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }

    const admin = createAdminClient();
    const account = await getPaymentsAccount(admin, user.id);
    if (!account) {
      return NextResponse.json({ error: "not_connected" }, { status: 400 });
    }
    if (!account.charges_enabled) {
      return NextResponse.json({ error: "charges_not_enabled" }, { status: 400 });
    }

    const body = await req.json();
    const { name, description, priceCents, currency, isRecurring, recurringInterval, imageUrl } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "name_required" }, { status: 400 });
    }
    if (typeof priceCents !== "number" || priceCents < MIN_PRICE_CENTS || priceCents > MAX_PRICE_CENTS) {
      return NextResponse.json({ error: "invalid_price" }, { status: 400 });
    }

    const result = await createProduct(admin, account, {
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : undefined,
      priceCents,
      currency: typeof currency === "string" ? currency : undefined,
      isRecurring: Boolean(isRecurring),
      recurringInterval: recurringInterval === "month" || recurringInterval === "year" ? recurringInterval : undefined,
      imageUrl: typeof imageUrl === "string" ? imageUrl : undefined,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ product: result.product });
  } catch (err) {
    logApiError("api/payments/products:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const on = await isFeatureOn("ionexa-payments", user);
    if (!on) return NextResponse.json({ error: "not_available" }, { status: 404 });

    const body = await req.json();
    const { productId } = body;
    if (!productId || typeof productId !== "string") {
      return NextResponse.json({ error: "product_id_required" }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await deactivateProduct(admin, user.id, productId);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api/payments/products:DELETE", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
