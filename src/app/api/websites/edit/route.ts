import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editWebsiteHtml } from "@/lib/website-builder";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";
import { downloadReferenceImages } from "@/lib/website-reference-image-server";
import { resolveWebsiteImagePlaceholders } from "@/lib/website-image-resolver";
import {
  describeSecurityScanIssue,
  scanWebsiteHtmlForSecurityIssues,
  stripDisallowedExternalScripts,
} from "@/lib/website-html-security-scan";
import { reviewWebsiteContentSafety } from "@/lib/website-security-review";
import { logSecurityCheck } from "@/lib/security-check-log";
import { getSiteUrl } from "@/lib/site-url";
import { nextVersionNumber } from "@/lib/website-versioning";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
  getPurchasedPackCreditPriceEur,
} from "@/lib/billing/credits";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { buildUsageReceipt } from "@/lib/billing/usage-receipt";
import { WEBSITE_BUILDER_MODEL } from "@/lib/ai-models";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

// Unlike api/websites/generate, this route is NOT split into a fast
// "start" request + background "process" request — the client awaits
// this single request directly, so it had NO explicit maxDuration at
// all before this (silently inheriting the platform default, as low as
// 10s on some tiers) despite calling editWebsiteHtml with the same
// WEBSITE_MAX_TOKENS (32000) ceiling as full generation, now also
// potentially downloading/resizing new reference images and resolving
// image placeholders afterward. This was the single biggest real gap
// found in this pass's timeout audit — a large edit (long change
// request, several new reference images) was genuinely at risk of the
// exact "Network error" symptom already fixed for generation. 300s
// (5 min) is the floor requested for AI-calling endpoints generally;
// full parity with generation's background-job architecture (which
// allows up to 800s) would need the same fast-start-then-process split,
// a larger change out of scope for this pass.
export const maxDuration = 300;

const MAX_CHANGE_REQUEST_LENGTH = 20000;

// Website Builder post-generation editing — takes the website's own
// current html_content as context (RLS-scoped read, not trusted from the
// client) plus a free-text change request, and asks Claude for a full
// updated HTML document (lib/website-builder.ts's editWebsiteHtml). Every
// edit appends a new website_versions row and updates user_websites'
// html_content in place, so the preview/download UI always shows the
// latest version without any changes there.
export async function POST(request: Request) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    let websiteId: string;
    let changeRequest: string;
    let referenceImagePaths: string[];
    try {
      const body = await request.json();
      websiteId = typeof body?.websiteId === "string" ? body.websiteId : "";
      changeRequest =
        typeof body?.changeRequest === "string"
          ? body.changeRequest.trim().slice(0, MAX_CHANGE_REQUEST_LENGTH)
          : "";
      referenceImagePaths = Array.isArray(body?.referenceImagePaths)
        ? body.referenceImagePaths.filter((p: unknown): p is string => typeof p === "string").slice(0, MAX_REFERENCE_IMAGES)
        : [];
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!websiteId || !changeRequest) {
      return NextResponse.json(
        { ok: false, error: "A website and a change request are required." },
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

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(
      user.id,
      "website_edit",
      fingerprintRequest(websiteId, changeRequest)
    );
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, edited: false, rateLimited: true, message: breakerCheck.reason });
    }

    const { data: website, error: fetchError } = await supabase
      .from("user_websites")
      .select("id, html_content")
      .eq("id", websiteId)
      .single();

    if (fetchError || !website) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }

    // Idempotency guard — a real, atomic DB-level claim, not a check-
    // then-act race: this single UPDATE only succeeds (returns a row) if
    // no OTHER edit is currently in flight for this website (or the
    // previous one is stale — over 2 minutes old, presumably crashed/
    // abandoned without clearing itself, see the finally-equivalent
    // release below). Two concurrent edit requests for the same website
    // both reach this UPDATE; Postgres serializes them, and whichever
    // loses sees zero rows returned — genuinely impossible for both to
    // proceed to the real AI call below, unlike a SELECT-then-UPDATE
    // check in application code.
    const staleClaimCutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: claimedRows, error: claimError } = await supabase
      .from("user_websites")
      .update({ editing_started_at: new Date().toISOString() })
      .eq("id", websiteId)
      .or(`editing_started_at.is.null,editing_started_at.lt.${staleClaimCutoff}`)
      .select("id");

    if (claimError) {
      logApiError("/api/websites/edit", claimError, { stage: "claim_edit_lock" });
      return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
    }
    if (!claimedRows || claimedRows.length === 0) {
      return NextResponse.json({
        ok: true,
        edited: false,
        message: "A generation is already in progress for this — please wait for it to finish.",
      });
    }

    // Every return path from here on MUST release the claim — otherwise
    // a genuinely failed edit would leave the website locked out of
    // editing for the full 2-minute stale window for no reason. A plain
    // try/finally around the rest of the handler guarantees that: a
    // `return` inside the try below still runs this finally block before
    // actually returning, so every existing early-return further down
    // releases the claim automatically without needing to touch each one
    // individually.
    try {
    // Credits: RESERVE -> EXECUTE -> SETTLE, the same three-phase billing
    // as generation (lib/billing/reservations.ts). The edit used to charge
    // a size-based heuristic (lib/website-edit-cost.ts) — dynamic, but not
    // MEASURED, and priced against the list rate: on Ultimate's €0.008
    // per-credit rate the heuristic could land under the 4x guarantee.
    // Settlement now charges the real usage of every call the edit makes
    // (cheap patch or every regeneration round, plus the safety review).
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig();
    const accountCreditPriceEur = bypassCredits
      ? pricingConfig.creditPriceEur
      : effectiveCreditPriceEurForAccount(
          plan,
          await getPurchasedPackCreditPriceEur(user.id),
          pricingConfig
        );
    // The current HTML is re-sent as context, so the estimate has to
    // scale with it — that is what the hold is sized from.
    const estimate = estimateForAction(
      "websiteEdit",
      {
        model: WEBSITE_BUILDER_MODEL,
        inputChars: website.html_content.length + changeRequest.length,
        imageCount: referenceImagePaths.length,
        planSlug: plan?.slug ?? null,
      },
      pricingConfig,
      accountCreditPriceEur
    );
    if (!bypassCredits) {
      const check = await hasEnoughCredits(user.id, estimate.reserveCredits, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          edited: false,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, estimate.reserveCredits),
        });
      }
    }

    // New reference images attached to THIS edit request (e.g. "add this
    // photo to the hero section") — same download/resize/public-url
    // pipeline as initial generation (lib/website-reference-image-server.ts),
    // reused rather than duplicated. Independently best-effort: one bad
    // image never blocks the edit itself.
    const referenceImages =
      referenceImagePaths.length > 0
        ? await downloadReferenceImages(supabase, referenceImagePaths, "/api/websites/edit")
        : [];
    const formEndpointUrl = `${getSiteUrl()}/api/websites/${websiteId}/submit-form`;

    // RESERVE, before the first AI call, so a second concurrent action
    // sees a balance that already excludes this one.
    const costs = new CostAccumulator();
    let reservationId = "";
    if (!bypassCredits) {
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "website_edit", {
        websiteId,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        return NextResponse.json({
          ok: true,
          edited: false,
          rateLimited: true,
          message:
            reservation.reason === "insufficient"
              ? insufficientCreditsMessage(reservation.available, estimate.reserveCredits)
              : "Could not reserve credits for this edit. No credits were charged — please try again.",
        });
      }
      reservationId = reservation.reservationId;
    }

    let updatedHtml: string;
    let usedCheapPatch = false;
    try {
      void recordAiCallForDailySpend(estimate.estimatedCredits);
      const editResult = await editWebsiteHtml(apiKey, website.html_content, changeRequest, referenceImages, formEndpointUrl, costs);
      updatedHtml = editResult.html;
      usedCheapPatch = editResult.usedCheapPatch;
      updatedHtml = await resolveWebsiteImagePlaceholders(updatedHtml);

      // AI Output Protection Layer — same two-layer check as generation
      // (see api/websites/generate/process/route.ts's file comment for
      // why): a free static scan, then a small AI content-safety review
      // folded into this SAME already-charged edit call. Unlike a fresh
      // generation, an edit always has a known-good PREVIOUS version to
      // fall back to, so a flagged edit is simply rejected outright
      // (html_content stays unchanged, nothing charged) rather than
      // shipped with a warning.
      updatedHtml = stripDisallowedExternalScripts(updatedHtml);
      const securityIssues = scanWebsiteHtmlForSecurityIssues(updatedHtml);
      const contentReview = await reviewWebsiteContentSafety(apiKey, updatedHtml, costs);
      const allIssueDescriptions = [
        ...securityIssues.map(describeSecurityScanIssue),
        ...contentReview.concerns,
      ];

      void logSecurityCheck(supabase, {
        userId: user.id,
        resourceType: "website",
        resourceId: websiteId,
        result: {
          passed: allIssueDescriptions.length === 0,
          checks: ["static HTML scan (script/iframe/handler/form/eval)", "AI content-safety review"],
          issues: allIssueDescriptions,
        },
      });

      if (allIssueDescriptions.length > 0) {
        logApiError("/api/websites/edit", "edited HTML flagged by AI Output Protection Layer", {
          websiteId,
          issues: allIssueDescriptions.join("; "),
        });
        // The promise in the message below is kept literally: the hold is
        // released and nothing is charged. The AI spend on the rejected
        // edit is the business's cost, same as before this change.
        await releaseReservation(user.id, reservationId);
        return NextResponse.json({
          ok: true,
          edited: false,
          flagged: true,
          message: `This edit was blocked by our safety review and wasn't applied: ${allIssueDescriptions.join("; ")}. No credits were charged — your website is unchanged.`,
        });
      }
    } catch (err) {
      logApiError("/api/websites/edit", err, { stage: "anthropic_call" });
      await releaseReservation(user.id, reservationId);
      const errMessage = err instanceof Error ? err.message : "The website edit request failed.";
      return NextResponse.json(
        { ok: false, error: `${errMessage} No credits were charged — please try again.` },
        { status: 502 }
      );
    }

    const { count: existingVersionCount } = await supabase
      .from("website_versions")
      .select("id", { count: "exact", head: true })
      .eq("website_id", websiteId);
    const versionNumber = nextVersionNumber(existingVersionCount ?? 0);

    const { data: updatedRecord, error: updateError } = await supabase
      .from("user_websites")
      .update({ html_content: updatedHtml })
      .eq("id", websiteId)
      .select()
      .single();

    if (updateError) {
      logApiError("/api/websites/edit", updateError, { stage: "update" });
      await releaseReservation(user.id, reservationId);
      return NextResponse.json(
        { ok: false, error: "Could not save the edit. No credits were charged — please try again." },
        { status: 500 }
      );
    }

    // Only now — the AI call succeeded AND the result is durably saved —
    // is this confirmed a success worth charging for. Settlement charges
    // the MEASURED cost of every call this edit made (the cheap patch or
    // every regeneration round, plus the content-safety review) at the
    // account's own per-credit rate and resolved margin, and releases the
    // rest of the hold — the same machinery as generation.
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "website_edit",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: {
        websiteId,
        usedCheapPatch,
        outputChars: updatedHtml.length,
        estimatedCredits: estimate.estimatedCredits,
        reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
      },
    });

    const { error: versionError } = await supabase.from("website_versions").insert({
      user_id: user.id,
      website_id: websiteId,
      version_number: versionNumber,
      html_content: updatedHtml,
      change_description: changeRequest,
    });
    if (versionError) {
      logApiError("/api/websites/edit", versionError, { stage: "insert_version" });
    }

    return NextResponse.json({
      ok: true,
      edited: true,
      record: updatedRecord,
      usage: buildUsageReceipt({
        creditsCharged: settlement.creditsCharged,
        bypass: bypassCredits,
        wouldHaveCharged: null,
        freeRemaining: null,
      }),
    });
    } finally {
      // Release the claim regardless of how the try block above exits —
      // success, an early return, or an exception. Best-effort: if this
      // update itself fails, the claim still self-expires after 2
      // minutes via the staleClaimCutoff check above, so it can never
      // lock a website out of editing forever.
      const { error: releaseError } = await supabase
        .from("user_websites")
        .update({ editing_started_at: null })
        .eq("id", websiteId);
      if (releaseError) {
        logApiError("/api/websites/edit", releaseError, { stage: "release_edit_lock" });
      }
    }
  } catch (err) {
    logApiError("/api/websites/edit", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
