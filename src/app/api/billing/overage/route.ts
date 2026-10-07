import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkCap, consentPreview, OVERAGE_PRICE_EUR_PER_CREDIT } from "@/lib/billing/overage";
import { disableOverage, enableOverage, loadOverageState } from "@/lib/billing/overage-store";

export const dynamic = "force-dynamic";

/**
 * TURNING OVERAGE ON, AND OFF.
 *
 * POST is the ONLY path by which `enabled` becomes true anywhere in this
 * application, and it requires the user to have sent a cap — there is no
 * default, because a default cap is a limit we chose on somebody else's
 * behalf and then charged them against.
 *
 * DELETE is the off switch, and it is deliberately the cheapest thing in
 * the file. The customer can also delete the row directly through their
 * own client (the table grants them DELETE), so cancelling does not
 * depend on this route being up.
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const state = await loadOverageState(user.id);
  return NextResponse.json({
    enabled: state.enabled,
    capEur: state.capEur,
    pricePerCreditEur: state.pricePerCreditEur ?? OVERAGE_PRICE_EUR_PER_CREDIT,
    spentEur: state.spentEur,
    month: state.month,
    // THE COST BEFORE THE DECISION. What the list price is and what a cap
    // buys at it, so the dialog can show both without doing arithmetic of
    // its own that could disagree with the server's.
    listPriceEur: OVERAGE_PRICE_EUR_PER_CREDIT,
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    // ONLY A SUBSCRIBER. Overage is billed as invoice items on the
    // customer's next Stripe invoice (lib/billing/overage-invoice.ts), so
    // an account with no customer and subscription has nothing to bill it
    // to. The ids are server-owned since
    // 20261010000000_guard_entitlement_metadata.sql.
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const isSubscriber =
      typeof meta.stripe_customer_id === "string" && meta.stripe_customer_id.length > 0 &&
      typeof meta.stripe_subscription_id === "string" && meta.stripe_subscription_id.length > 0;
    if (!isSubscriber) return NextResponse.json({ error: "needs_subscription" }, { status: 403 });

    const body = (await request.json()) as { capEur?: unknown; shortfall?: unknown };

    const cap = checkCap(body.capEur);
    if (!cap.ok) return NextResponse.json({ error: "bad_cap", detail: cap.reason }, { status: 400 });

    // THE PRICE IS TAKEN FROM THE SERVER'S LIST, never from the request.
    // A client that could send its own price could consent on the user's
    // behalf to any rate at all.
    const result = await enableOverage({
      userId: user.id,
      capEur: cap.capEur,
      pricePerCreditEur: OVERAGE_PRICE_EUR_PER_CREDIT,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });

    const shortfall = Number(body.shortfall);
    return NextResponse.json({
      ok: true,
      capEur: cap.capEur,
      preview: consentPreview({
        shortfall: Number.isFinite(shortfall) ? shortfall : 0,
        capEur: cap.capEur,
      }),
    });
  } catch (err) {
    logApiError("/api/billing/overage", err, { stage: "enable" });
    return NextResponse.json({ error: "could_not_save" }, { status: 500 });
  }
}

export async function DELETE() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const result = await disableOverage(user.id);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 500 });
  return NextResponse.json({ ok: true });
}
