import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyWebsiteDescription, WEBSITE_MODEL } from "@/lib/website-builder";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { MAX_REFERENCE_IMAGES, referenceImagePathBelongsToUser } from "@/lib/website-reference-image";
import { isAdminEmail } from "@/lib/auth/admin-emails";
import { hasActiveBetaBypass } from "@/lib/beta";
import { checkBypassCeiling } from "@/lib/billing/bypass-ceiling";
import {
  CREDIT_COSTS,
  deductCredits,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { settleReservation } from "@/lib/billing/reservations";
import { checkNeedsClarification } from "@/lib/clarification";
import { isLargeGenerationRequest } from "@/lib/website-generation-limits";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 20000;

// Fair-use daily cap — applies even to "unlimited" plans (Ultimate/
// Enterprise's marketing copy is "unlimited team seats/AI agents", never
// "unlimited generations"; credits are the real per-plan limit for
// everyone else, but Ultimate/Enterprise's large monthly credit
// allotment plus admin/beta bypass accounts have no natural ceiling on
// requests/day). 50/day is far above realistic use (realistically 1-5/
// day) — this exists purely to catch runaway automation/bugs/abuse, not
// to constrain any real user. Applied to every plan uniformly (simpler
// and still harmless for lower tiers, which hit their credit limit
// first in every realistic scenario) rather than only Ultimate.
// Independent of, and in addition to, the platform-wide circuit breaker
// (lib/ai-circuit-breaker.ts) below, which is the final safety net
// across the whole platform regardless of plan or per-feature caps.
const MAX_GENERATIONS_PER_DAY = 50;
const FAIR_USE_WINDOW_MS = 24 * 60 * 60 * 1000;

// Website Builder — job START. Deliberately fast: validates the request,
// runs the (small, ~300-token) off-topic classifier, checks the user has
// enough credits for a rough cost estimate, then creates a user_websites
// row with status "pending" and returns immediately — it does NOT run the
// actual (slow, expensive) Claude generation call itself.
//
// The client is expected to immediately follow this with a second,
// independent request to /api/websites/generate/process (with
// `keepalive: true`, not awaited) to actually kick off generation, then
// poll /api/websites/status for progress. This two-request split exists
// specifically so this route always returns in well under a second: a
// client-side fetch() timeout can no longer be mistaken for a failure
// (see api/websites/generate/process/route.ts's file comment for why the
// second request survives the client navigating away or closing the tab,
// and for why credits are only ever charged there, after confirmed
// success).
//
// Distinct from /api/modules/create's "websites" Build module (ai_websites
// table), which is a plain CRUD tracker with no AI call — see
// dashboard/website-builder/page.tsx for why this lives at a different
// route.
export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let name: string;
    let description: string;
    let referenceImagePaths: string[];
    let skipClarification: boolean;
    try {
      const body = await request.json();
      name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
      description = typeof body?.description === "string" ? body.description.trim() : "";
      referenceImagePaths = Array.isArray(body?.referenceImagePaths)
        ? body.referenceImagePaths.filter((p: unknown): p is string => typeof p === "string").slice(0, MAX_REFERENCE_IMAGES)
        : [];
      skipClarification = body?.skipClarification === true;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!name || !description) {
      return NextResponse.json(
        { ok: false, error: "Name and description are required." },
        { status: 400 }
      );
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: `Description is too long (${description.length}/${MAX_DESCRIPTION_LENGTH} characters) — please shorten it and try again.`,
        },
        { status: 400 }
      );
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Defence in depth: only paths inside this user's own storage folder.
    // Storage RLS enforces the same thing at the bucket level, so this is
    // not the last line of defence — it is here so the invariant the rest
    // of this route depends on is stated by this route, rather than
    // assumed to hold because of a policy in another system.
    referenceImagePaths = referenceImagePaths.filter((p) =>
      referenceImagePathBelongsToUser(p, user.id)
    );

    // Fair-use daily cap — applies to every account, including admin/beta
    // (see MAX_GENERATIONS_PER_DAY above for why no exception is made).
    // Cheap COUNT, no AI call, so it's checked before anything that costs
    // real money. A rolling 24h window (not calendar-day) so it can't be
    // reset early by waiting for local midnight.
    const fairUseCutoff = new Date(Date.now() - FAIR_USE_WINDOW_MS).toISOString();
    const { count: generationsToday, error: fairUseCountError } = await supabase
      .from("user_websites")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", fairUseCutoff);
    if (!fairUseCountError && (generationsToday ?? 0) >= MAX_GENERATIONS_PER_DAY) {
      return NextResponse.json({
        ok: true,
        generated: false,
        rateLimited: true,
        message: "You've reached today's generation limit. Contact support if you need more.",
      });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(user.id, "website_generate", fingerprintRequest(name, description));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, generated: false, rateLimited: true, message: breakerCheck.reason });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));

    // THE BYPASS EUR CEILING. checkAiCallAllowed above caps volume for
    // every account; this caps real Anthropic SPEND specifically for the
    // accounts credits do not — admin and active beta. See
    // lib/billing/bypass-ceiling.ts for why this is one check in euros
    // rather than a counter re-implemented per feature.
    if (bypassCredits) {
      const ceiling = await checkBypassCeiling(user.id, isAdmin, bypassCredits && !isAdmin);
      if (!ceiling.allowed) {
        return NextResponse.json({ ok: false, error: ceiling.reason }, { status: 429 });
      }
    }
    // Clarifying-questions pre-check (see lib/clarification.ts) — runs
    // BEFORE the off-topic classifier and BEFORE any row is created, but
    // only on the user's first submission: skipClarification is true on
    // the resubmission after they've answered (or explicitly skipped),
    // so this never runs twice, and never blocks a request that's
    // already clear. Charged (1 credit) as soon as a real answer comes
    // back from Claude, regardless of the verdict — same "charge on
    // confirmed success" timing as every other AI call in this app,
    // where "success" here means a real classification was returned, not
    // a database write.
    // The two pre-check calls this route makes are MEASURED and settled on
    // real usage, exactly like the generation itself.
    //
    // DEFECT this fixes: both checkNeedsClarification and
    // classifyWebsiteDescription take an optional CostAccumulator, and this
    // route passed neither. Their real Anthropic cost was therefore never
    // measured, never written to ai_cost_log (so the margin report could
    // not see it), and charged as a FLAT 1 credit for the clarification and
    // NOTHING at all for the classifier.
    //
    // Meanwhile the worker settles its own calls at the full multiplier. So
    // part of one generation earned 4x and part earned 0x, and the blend
    // landed below the guarantee — measured in production at 3.1x (44
    // credits charged for a €0.28 generation, where 4x is 57).
    //
    // A flat per-call fee cannot track cost by construction, which is why
    // this is a settlement rather than a bigger flat number.
    const costs = new CostAccumulator();
    // Always resolved, never null — even for a bypass account.
    //
    // A null plan reached the cost log as planSlug: null, and made
    // wouldHaveChargedCredits price against the LIST rate instead of the
    // account's own. The saving was one metadata read; the cost was that
    // admin and beta rows could not be checked against anything.
    const precheckPlan = await resolveEffectivePlan(user);

    async function settlePrechecks() {
      // Nothing measured (no call ran, or every call threw before
      // returning usage) — settling would write a zero-cost log row for
      // work that never happened.
      if (costs.callCount === 0) return;
      await settleReservation({
        userId: user!.id,
        // No hold to release: these calls are small, bounded and already
        // finished by the time this runs. settle_reservation treats an
        // empty reservation id as "charge only".
        reservationId: "",
        feature: "website_generate_precheck",
        costs,
        plan: precheckPlan,
        // Admin/beta accounts are still LOGGED — their spend is real and
        // has to appear in the margin report — but charged nothing.
        bypassCharge: bypassCredits,
        metadata: { route: "/api/websites/generate" },
      });
    }

    if (!skipClarification) {
      if (precheckPlan) {
        const check = await hasEnoughCredits(user.id, CREDIT_COSTS.clarificationCheck, precheckPlan);
        if (!check.ok) {
          return NextResponse.json({
            ok: true,
            generated: false,
            rateLimited: true,
            message: insufficientCreditsMessage(check.remaining, CREDIT_COSTS.clarificationCheck),
          });
        }
      }
      try {
        void recordAiCallForDailySpend(1);
        const clarification = await checkNeedsClarification(apiKey, "website", description, costs);
        if (clarification.needsClarification) {
          // Settle before returning: this call really ran and really cost
          // money, whether or not a website ends up being generated.
          await settlePrechecks();
          return NextResponse.json({
            ok: true,
            generated: false,
            needsClarification: true,
            questions: clarification.questions,
            questionSuggestions: clarification.suggestions,
          });
        }
      } catch (err) {
        // Best-effort: a clarification-check hiccup shouldn't block a
        // real request — fall through to normal generation. Anything the
        // accumulator did capture before the throw is still settled below.
        logApiError("/api/websites/generate", err, { stage: "clarification_check" });
      }
    }

    // Off-topic guard — a cheap classification call BEFORE any credits are
    // touched or any row is created, so a request like "write me a poem"
    // costs the user nothing and gets a real, helpful message instead of
    // an AI call that just wraps the poem in an HTML page (see
    // lib/website-builder.ts).
    try {
      void recordAiCallForDailySpend(1);
      const classification = await classifyWebsiteDescription(apiKey, description, costs);
      if (!classification.isWebsiteRequest) {
        // Same reasoning as the clarification branch: the call ran and
        // cost money, so it is settled even though nothing gets generated.
        await settlePrechecks();
        return NextResponse.json({ ok: true, generated: false, message: classification.message });
      }
    } catch (err) {
      // Best-effort: a classifier hiccup shouldn't block a real website
      // request, so fall through to normal generation.
      logApiError("/api/websites/generate", err, { stage: "classify_call" });
    }

    // Both pre-checks passed and generation will proceed. Settle them here
    // rather than trying to hand the usage to the worker: the worker runs
    // as a separate request and may never start (the client can navigate
    // away between the two), and an AI call that already happened must be
    // charged regardless of what happens next.
    await settlePrechecks();

    // Credits: a READ-ONLY check against a rough pre-generation estimate
    // (lib/website-generation-cost.ts) — rejects early, before creating
    // any row, if the user clearly can't afford it. The REAL charge is
    // computed and deducted in the process route below, only after the
    // website has actually, successfully finished generating — never
    // here, and never if that call fails.
    if (!bypassCredits) {
      const plan = await resolveEffectivePlan(user);
      // Deliberately the SAME estimate the process route reserves against
      // (lib/billing/estimate.ts), not a second independent formula. When
      // these two disagree, the user is told they have enough credits here
      // and then blocked by the reservation seconds later, with a website
      // row already created — a confusing failure that only exists because
      // two numbers were computed different ways.
      const pricingConfig = resolvePricingConfig();
      const estimatedCost = estimateForAction(
        "websiteGenerate",
        {
          model: WEBSITE_MODEL,
          inputChars: description.length,
          imageCount: referenceImagePaths.length,
          planSlug: plan?.slug ?? null,
        },
        pricingConfig,
        effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        )
      ).reserveCredits;
      const check = await hasEnoughCredits(user.id, estimatedCost, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          generated: false,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, estimatedCost),
        });
      }
    }

    // Idempotency guard — a fast double-submit (double-click, or a retry
    // fired while the first request is still in flight) would otherwise
    // create TWO separate "pending" rows for what's really the same
    // request, each independently kicking off its own real, billed
    // generation. Since this route's own job is only ever a few hundred
    // milliseconds (see the file comment above), a genuine duplicate
    // submission lands here within seconds of the first — so an existing
    // pending row for this exact user+name within the last 2 minutes is
    // treated as the SAME request: its record is returned as-is instead
    // of creating a second one. This is a fast-path check (name is the
    // only field this table stores from the original request — the full
    // description isn't persisted here); the unique index added below is
    // the real, race-proof backstop for the case where two requests land
    // close enough together that this SELECT alone wouldn't catch it.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await supabase
      .from("user_websites")
      .select("*")
      .eq("user_id", user.id)
      .eq("name", name)
      .eq("status", "pending")
      .gte("created_at", twoMinutesAgo)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentDuplicate) {
      return NextResponse.json({
        ok: true,
        generated: true,
        pending: true,
        record: recentDuplicate,
        duplicateSuppressed: true,
      });
    }

    const { data: record, error: insertError } = await supabase
      .from("user_websites")
      .insert({
        user_id: user.id,
        name,
        description,
        html_content: "",
        status: "pending",
        has_reference_images: referenceImagePaths.length > 0,
        is_large_request: isLargeGenerationRequest(description.length, referenceImagePaths.length),
      })
      .select()
      .single();

    if (insertError) {
      // Postgres unique-violation (23505) on user_websites_pending_dedup_idx
      // (user_id, name) where status = 'pending' — see supabase_schema.sql.
      // This is the real, DB-level idempotency guarantee: it means a
      // concurrent request won the race and already inserted the pending
      // row for this exact user+name in the tiny window between the
      // SELECT above and this INSERT. Treat it exactly like the fast-path
      // duplicate above rather than surfacing an error the user didn't
      // cause — fetch and return that row instead of failing the request.
      if (insertError.code === "23505") {
        const { data: winningRow } = await supabase
          .from("user_websites")
          .select("*")
          .eq("user_id", user.id)
          .eq("name", name)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (winningRow) {
          return NextResponse.json({
            ok: true,
            generated: true,
            pending: true,
            record: winningRow,
            duplicateSuppressed: true,
          });
        }
      }
      logApiError("/api/websites/generate", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: "Could not start generation. Please try again." }, { status: 500 });
    }

    // Bind the reference images to THIS website, now, before any
    // generation runs.
    //
    // DEFECT this fixes: these rows used to be written only after the
    // worker finished, which meant that during generation the worker had
    // no server-side record of which images belonged to this site — so it
    // took the list straight from its request body. Any stale path left in
    // client state (a failed generation, a closed form, an abandoned
    // clarification) was accepted and baked into the next website. That is
    // the "photos from a previous project appeared in the new one" report.
    //
    // Writing the association here makes it authoritative BEFORE the work
    // starts, so the worker can stop trusting its caller entirely.
    if (referenceImagePaths.length > 0) {
      const { error: refError } = await supabase.from("website_reference_images").insert(
        referenceImagePaths.map((imageUrl) => ({
          user_id: user.id,
          website_id: record.id,
          image_url: imageUrl,
        }))
      );
      if (refError) {
        // Not best-effort, unlike most of the bookkeeping in this app: if
        // this fails the worker would generate a site with NO images while
        // the user watched them upload. Fail the start instead, and mark
        // the row so nothing picks it up half-configured.
        logApiError("/api/websites/generate", refError, { stage: "insert_reference_images" });
        await supabase
          .from("user_websites")
          .update({ status: "failed", error_message: "Could not attach the reference images." })
          .eq("id", record.id)
          .eq("status", "pending");
        return NextResponse.json(
          { ok: false, error: "Could not attach the reference images. Please try again." },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ ok: true, generated: true, pending: true, record });
  } catch (err) {
    logApiError("/api/websites/generate", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong — no credits were charged. Please try again." },
      { status: 500 }
    );
  }
}
