import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import type { UserWebsite } from "@/types/user-website";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { getPurchasedPackCreditPriceEur, hasEnoughCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";

export const dynamic = "force-dynamic";

// Regenerate a website the AI Output Protection Layer flagged (status
// 'flagged' — see api/websites/generate/process/route.ts). Every one is a
// normal paid generation, priced on the button before it is pressed (the
// free first one waits on a budget decision, NEEDS 33). Resets
// the row back to 'pending' and hands the client back the original
// description + already-uploaded reference image paths so it can
// immediately re-fire the normal /api/websites/generate/process worker
// request, same as a fresh generation — this route itself makes no AI
// call and charges nothing; the worker holds and settles.
export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const websiteId = params.id;
    if (!websiteId) {
      return NextResponse.json({ ok: false, error: "Missing website id." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS (select_own_user_websites) already scopes this to the caller's
    // own row — a stranger's websiteId simply won't be found.
    const { data: website, error: fetchError } = await supabase
      .from("user_websites")
      .select("*")
      .eq("id", websiteId)
      .maybeSingle();

    if (fetchError || !website) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }

    const typedWebsite = website as UserWebsite;

    if (typedWebsite.status !== "flagged") {
      return NextResponse.json(
        { ok: false, error: "Only a flagged website can be regenerated." },
        { status: 400 }
      );
    }
    if (!typedWebsite.description) {
      return NextResponse.json(
        {
          ok: false,
          error: "This website was created before regeneration was supported — please start a new one instead.",
        },
        { status: 400 }
      );
    }

    const { data: imageRows } = await supabase
      .from("website_reference_images")
      .select("image_url")
      .eq("website_id", websiteId);
    const referenceImagePaths = (imageRows ?? []).map((r) => r.image_url as string);

    // NO BALANCE, NO START (NEEDS 24). A run with too few credits
    // would be refused by the worker's hold anyway — but only after this
    // route had moved the row out of 'flagged', leaving a failed site the
    // button can no longer reach. So it is asked here first, against the
    // same estimate the button shows, and the row stays as it was. The
    // worker's hold is still the real gate: it also counts the account
    // context this estimate cannot see.
    if (!isAdminEmail(user.email) && !(await hasActiveBetaBypass(user))) {
      const plan = await resolveEffectivePlan(user);
      const config = resolvePricingConfig();
      const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
      const estimate = estimateForAction(
        "websiteGenerate",
        {
          model: WEBSITE_BUILDER_MODEL,
          inputChars: typedWebsite.description.length,
          imageCount: Math.min(referenceImagePaths.length, MAX_REFERENCE_IMAGES),
          planSlug: plan?.slug ?? null,
        },
        config,
        effectiveCreditPriceEurForAccount(plan, packPriceEur, config)
      );
      const affordable = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!affordable.ok) {
        return NextResponse.json(
          {
            ok: false,
            code: "insufficient_credits",
            needed: estimate.reserveCredits,
            available: affordable.remaining,
          },
          { status: 402 }
        );
      }
    }

    // Atomic conditional UPDATE — only claims if it's still 'flagged',
    // same race-guard pattern used by editing_started_at/
    // processing_started_at elsewhere in this app: a fast double-click on
    // "Regenerate" can only ever win this update once.
    const { data: claimedRows, error: claimError } = await createAdminClient()
      .from("user_websites")
      .update({ status: "pending", error_message: null })
      .eq("id", websiteId)
      .eq("user_id", user.id)
      .eq("status", "flagged")
      .select("id");

    if (claimError) {
      logApiError("/api/websites/[id]/regenerate", claimError, { stage: "claim" });
      return NextResponse.json({ ok: false, error: "Could not start the regenerate. Please try again." }, { status: 500 });
    }
    if (!claimedRows || claimedRows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "This website's regenerate has already been started." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      ok: true,
      websiteId,
      description: typedWebsite.description,
      referenceImagePaths,
    });
  } catch (err) {
    logApiError("/api/websites/[id]/regenerate", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
