import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveEffectivePlan, getOrInitCredits, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import {
  BADGE_REMOVAL_CREDITS_PER_MONTH,
  checkBadgeRemovalPurchase,
  monthStart,
  removalPreview,
} from "@/lib/publishing/badge-credits";
import { cancelAutoRenew, loadRemoval, purchaseRemoval } from "@/lib/publishing/badge-credits-store";

export const dynamic = "force-dynamic";

/**
 * BUYING AND CANCELLING BADGE REMOVAL, PER SITE.
 *
 * GET shows the price BEFORE anything is spent — in credits AND in
 * euros, plus how many months the current balance covers, because "200
 * credits" is a price in a currency the customer cannot value.
 *
 * POST spends. It refuses a paid plan with `already_free` rather than
 * taking the money, which is rule (ε) enforced where money moves and not
 * merely where the badge is drawn.
 *
 * DELETE turns auto-renewal off. It never takes back the month already
 * paid for — cancelling stops the NEXT charge, and a badge that
 * reappeared the instant somebody clicked cancel would be keeping their
 * credits and their attribution.
 */
async function ownedSite(userId: string, siteId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("published_sites")
    .select("id")
    .eq("id", siteId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const siteId = new URL(request.url).searchParams.get("siteId") ?? "";
    const plan = await resolveEffectivePlan(user);
    const credits = await getOrInitCredits(user.id, plan);
    const creditPriceEur = effectiveCreditPriceEurForAccount(
      plan,
      await getPurchasedPackCreditPriceEur(user.id),
      resolvePricingConfig()
    );

    const removal = siteId ? await loadRemoval(siteId) : null;
    const verdict = checkBadgeRemovalPurchase({
      planSlug: plan?.slug ?? null,
      removal,
      creditsRemaining: credits.credits_remaining,
      now: new Date(),
    });

    return NextResponse.json({
      // THE COST BEFORE THE DECISION, in both units.
      ...removalPreview({
        creditPriceEur,
        creditsRemaining: credits.credits_remaining,
        sites: 1,
      }),
      creditsRemaining: credits.credits_remaining,
      coversMonth: monthStart(new Date()),
      active: Boolean(removal),
      autoRenewCancelled: Boolean(removal?.cancelledAt),
      // A PAID PLAN IS TOLD IT ALREADY HAS THIS, rather than shown a buy
      // button that would charge them for it.
      includedInPlan: verdict.ok === false && verdict.reason === "already_free",
      canBuy: verdict.ok,
      reason: verdict.ok ? null : verdict.reason,
    });
  } catch (err) {
    logApiError("/api/publishing/badge", err, { stage: "preview" });
    return NextResponse.json({ error: "could_not_load" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const limit = await checkRateLimit({
    scope: "badge-removal",
    identifier: user.id,
    maxAttempts: 20,
    windowMinutes: 60,
  });
  if (!limit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  try {
    const body = (await request.json()) as { siteId?: unknown };
    const siteId = typeof body.siteId === "string" ? body.siteId : "";
    if (!siteId) return NextResponse.json({ error: "unknown_site" }, { status: 400 });
    // THE SITE MUST BE THEIRS. Without this, a valid session could buy
    // removal for somebody else's site with their own credits — which
    // sounds harmless and is somebody paying to change a stranger's page.
    if (!(await ownedSite(user.id, siteId))) {
      return NextResponse.json({ error: "not_owner" }, { status: 404 });
    }

    const plan = await resolveEffectivePlan(user);
    const credits = await getOrInitCredits(user.id, plan);
    const removal = await loadRemoval(siteId);

    const verdict = checkBadgeRemovalPurchase({
      planSlug: plan?.slug ?? null,
      removal,
      creditsRemaining: credits.credits_remaining,
      now: new Date(),
    });
    if (!verdict.ok) {
      // 409 for "you already have this", 402 for "you cannot afford it".
      const status = verdict.reason === "insufficient_credits" ? 402 : 409;
      return NextResponse.json({ error: verdict.reason }, { status });
    }

    const creditPriceEur = effectiveCreditPriceEurForAccount(
      plan,
      await getPurchasedPackCreditPriceEur(user.id),
      resolvePricingConfig()
    );
    const bought = await purchaseRemoval({ userId: user.id, siteId, creditPriceEur });
    if (!bought.ok) {
      const status = bought.reason === "insufficient_credits" ? 402 : bought.reason === "already_active" ? 409 : 500;
      return NextResponse.json({ error: bought.reason }, { status });
    }

    return NextResponse.json({
      ok: true,
      creditsCharged: bought.creditsCharged,
      coversMonth: bought.coversMonth,
    });
  } catch (err) {
    logApiError("/api/publishing/badge", err, { stage: "purchase" });
    return NextResponse.json({ error: "could_not_save" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  try {
    const siteId = new URL(request.url).searchParams.get("siteId") ?? "";
    if (!siteId) return NextResponse.json({ error: "unknown_site" }, { status: 400 });
    const ok = await cancelAutoRenew(user.id, siteId);
    if (!ok) return NextResponse.json({ error: "could_not_save" }, { status: 500 });
    // WHAT THEY KEEP, said back to them. "Cancelled" on its own reads as
    // "the badge is back now", and it is not.
    return NextResponse.json({
      ok: true,
      keepsUntil: monthStart(new Date()),
      creditsPerMonth: BADGE_REMOVAL_CREDITS_PER_MONTH,
    });
  } catch (err) {
    logApiError("/api/publishing/badge", err, { stage: "cancel" });
    return NextResponse.json({ error: "could_not_save" }, { status: 500 });
  }
}
