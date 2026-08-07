import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWebsiteHtml, type ReferenceImage } from "@/lib/website-builder";
import { selectWebsiteBuilderModel } from "@/lib/ai/models";
import { MAX_REFERENCE_IMAGES, referenceImagePathBelongsToUser } from "@/lib/website-reference-image";
import { downloadReferenceImage } from "@/lib/website-reference-image-server";
import { FIRST_VERSION_NUMBER } from "@/lib/website-versioning";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { resolveEffectivePlan, getPurchasedPackCreditPriceEur } from "@/lib/billing/credits";
import { effectiveCreditPriceEurForAccount } from "@/lib/billing/credit-formula";
import { CostAccumulator } from "@/lib/billing/cost-accumulator";
import { estimateForAction } from "@/lib/billing/estimate";
import { resolvePricingConfig } from "@/lib/billing/pricing-config";
import { reserveCredits, settleReservation, releaseReservation } from "@/lib/billing/reservations";
import { estimateWebsiteGenerationCost } from "@/lib/website-generation-cost";
import { MAX_GENERATION_ATTEMPTS } from "@/lib/website-generation-limits";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { resolveWebsiteImagePlaceholders } from "@/lib/website-image-resolver";
import {
  describeSecurityScanIssue,
  scanWebsiteHtmlForSecurityIssues,
  stripDisallowedExternalScripts,
} from "@/lib/website-html-security-scan";
import { reviewWebsiteContentSafety } from "@/lib/website-security-review";
import { logSecurityCheck } from "@/lib/security-check-log";
import { getSiteUrl } from "@/lib/site-url";
import { logApiError } from "@/lib/log-error";
import { diagLog } from "@/lib/diag";

export const dynamic = "force-dynamic";

// Explicit execution-time budget for this route. Without this, the
// platform's own default function timeout applies — which, for a
// streaming Claude call that can legitimately run several minutes for a
// complex site with multiple reference images, is the most likely
// real-world cause of a website getting silently killed mid-generation:
// the row is already 'processing' by the time the platform kills the
// function, no catch block ever runs, no terminal status is ever
// written, and the client's poll loop (pollWebsiteStatus in
// website-builder-workspace.tsx) has no way to know the job is dead —
// exactly the "stuck forever" symptom this migration's attempt_count
// column and api/websites/status's stale-job cleanup exist to catch as a
// backstop. Raising this reduces how often that backstop needs to fire
// in the first place.
//
// 800s (~13.3 min) is Vercel's documented practical ceiling for a single
// Fluid Compute function invocation on Pro (Enterprise can configure
// higher with a custom limit) — raised here from 600s specifically for
// "large request" jobs (see is_large_request / LARGE_REQUEST_* in
// lib/website-generation-limits.ts: description > 5000 chars or 10+
// reference images), which legitimately need more processing time than
// a typical generation.
//
// IMPORTANT, HONEST LIMITATION: this does NOT make a genuinely 20-30
// minute generation reliably completable. STALE_JOB_TIMEOUT_LARGE_REQUEST_MS
// (25 min) in lib/website-generation-limits.ts is headroom for the
// client-visible backstop, not a claim that this route itself can run
// that long — a single Vercel serverless invocation realistically caps
// out well under 25-30 minutes on any commonly-available plan. If a
// specific generation genuinely needs that much wall-clock time, the
// function will still be killed by the platform before then, and the
// stale-job check is what eventually surfaces that as a clean "failed"
// state (no credits charged) rather than an infinite spinner — it is a
// safety net for that scenario, not a fix for it. Reliably supporting
// true 20-30 minute single-request generations would need a different
// execution model (a queue + long-running worker, or chunked/resumable
// generation) — a real architecture change, out of scope here.
export const maxDuration = 800;

const MAX_DESCRIPTION_LENGTH = 20000;

// Website Builder — job WORKER. This is the second of two requests the
// client makes for one generation (see api/websites/generate/route.ts,
// which creates the "pending" row this route fills in). The client fires
// this with `fetch(..., { keepalive: true })` and does NOT await or
// depend on its response — `keepalive` is what makes this request survive
// the browser tab being navigated away from or closed moments after it's
// sent: the browser guarantees the already-in-flight request is still
// delivered to the server, and once a normal Node.js request handler like
// this one has received it, its execution runs to completion exactly like
// any other request regardless of whether the client is still around to
// read the response — there is no separate "background job runtime"
// involved, just an ordinary request the UI chooses not to wait for.
//
// Credits are RESERVED here before the first AI call and SETTLED here
// after the website is durably saved — the three-phase flow in
// lib/billing/reservations.ts. The hold means a second concurrent
// generation sees a balance that already excludes this one; settlement
// then charges the REAL measured cost of every sub-call (generation
// stream, each continuation round, the AI security review) and releases
// the rest of the hold. A generation that throws releases the hold in
// full and charges nothing, which is the behaviour the failure messages
// have always promised.
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
    let description: string;
    try {
      const body = await request.json();
      websiteId = typeof body?.websiteId === "string" ? body.websiteId : "";
      description =
        typeof body?.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }
    // referenceImagePaths is deliberately NOT read from the body — see
    // where it is loaded below.

    if (!websiteId || !description) {
      return NextResponse.json({ ok: false, error: "websiteId and description are required." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts)
    // — the actual expensive AI call in this route, so this is checked
    // here too, not just in the start route (api/websites/generate).
    const breakerCheck = await checkAiCallAllowed(user.id, "website_generate_process", fingerprintRequest(websiteId));
    if (!breakerCheck.allowed) {
      await supabase
        .from("user_websites")
        .update({ status: "failed", error_message: breakerCheck.reason })
        .eq("id", websiteId)
        .eq("status", "pending");
      return NextResponse.json({ ok: true, failed: true });
    }

    // RLS (select_own_user_websites) already scopes this to the caller's
    // own row — a stranger's websiteId simply won't be found.
    const { data: website, error: fetchError } = await supabase
      .from("user_websites")
      .select("id, status, attempt_count")
      .eq("id", websiteId)
      .maybeSingle();

    if (fetchError || !website) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }

    // Idempotency guard — a duplicate/retried call for a row that's
    // already being worked on (or finished) is a no-op, not a re-run.
    if (website.status !== "pending") {
      return NextResponse.json({ ok: true, alreadyHandled: true });
    }

    // The reference images for THIS website, from the database — never
    // from the request body.
    //
    // DEFECT this fixes: this list used to come from body.referenceImagePaths
    // with no check that the paths had anything to do with this website.
    // Storage RLS scopes the bucket per USER, not per project, so every
    // path a user had ever uploaded stayed readable — and any stale one
    // still sitting in client state (a failed generation, a closed form,
    // an abandoned clarification) was accepted and baked into the next
    // site. That is the "photos from a previous project appeared in the
    // new one" report.
    //
    // api/websites/generate now writes these rows when it creates the
    // pending record, so by the time this worker runs the association
    // already exists and is authoritative. Reading it here means a caller
    // cannot influence which images are used at all.
    const { data: refRows, error: refError } = await supabase
      .from("website_reference_images")
      .select("image_url")
      .eq("website_id", websiteId)
      .eq("user_id", user.id)
      .order("id", { ascending: true })
      .limit(MAX_REFERENCE_IMAGES);

    if (refError) {
      logApiError("/api/websites/generate/process", refError, { stage: "load_reference_images" });
    }
    const referenceImagePaths: string[] = (refRows ?? [])
      .map((r) => r.image_url as string)
      .filter((p) => referenceImagePathBelongsToUser(p, user.id));

    // Hard circuit-breaker backstop (see lib/website-generation-limits.ts)
    // — this route has no auto-retry today, so in normal operation this
    // never fires; it exists purely so nothing (a client bug, a
    // double-submit race, a manually replayed request) can ever push a
    // single row's real AI-call count past a fixed ceiling.
    if (website.attempt_count >= MAX_GENERATION_ATTEMPTS) {
      await supabase
        .from("user_websites")
        .update({
          status: "failed",
          error_message: "Something went wrong generating your website — please try again. No credits were charged.",
        })
        .eq("id", websiteId);
      logApiError("/api/websites/generate/process", "generation attempt cap reached", {
        websiteId,
        attemptCount: website.attempt_count,
      });
      return NextResponse.json({ ok: true, failed: true, attemptCapReached: true });
    }

    await supabase
      .from("user_websites")
      .update({ status: "processing", attempt_count: website.attempt_count + 1 })
      .eq("id", websiteId);

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));

    // RESERVE -> EXECUTE -> SETTLE. The reservation is taken here, in the
    // same execution as the AI calls, rather than in the start route: the
    // two are separate requests, so a hold created there would have to be
    // carried through the user_websites row and could be stranded by a
    // process invocation that never runs. Holding it here still closes the
    // race the reservation exists for, because it is taken before the
    // first token is generated.
    const plan = await resolveEffectivePlan(user);
    const pricingConfig = resolvePricingConfig(plan?.slug ?? null);
    const costs = new CostAccumulator();

    // Same rate settlement will divide by, so the hold is sized in the
    // same currency as the charge.
    const packPriceEur = await getPurchasedPackCreditPriceEur(user.id);
    const accountCreditPriceEur = effectiveCreditPriceEurForAccount(plan, packPriceEur, pricingConfig);
    const estimate = estimateForAction(
      "websiteGenerate",
      {
        // Priced on the model the complexity rule will actually pick for
        // this brief — reserving at the premium rate for a brief the MAX
        // tier will serve would under-hold.
        model: selectWebsiteBuilderModel({
          descriptionChars: description.length,
          imageCount: Math.min(referenceImagePaths.length, MAX_REFERENCE_IMAGES),
        }).model,
        inputChars: description.length,
        imageCount: Math.min(referenceImagePaths.length, MAX_REFERENCE_IMAGES),
      },
      pricingConfig,
      accountCreditPriceEur
    );

    let reservationId = "";
    if (!bypassCredits) {
      const reservation = await reserveCredits(user.id, estimate.reserveCredits, "website_generate", {
        websiteId,
        descriptionLength: description.length,
        estimatedCredits: estimate.estimatedCredits,
      });
      if (!reservation.ok) {
        const message =
          reservation.reason === "insufficient"
            ? `Not enough credits to generate this website (you have ${reservation.available}, this needs about ${estimate.reserveCredits}). No credits were charged.`
            : "Could not reserve credits for this generation. No credits were charged — please try again.";
        await supabase
          .from("user_websites")
          .update({ status: "failed", error_message: message })
          .eq("id", websiteId);
        return NextResponse.json({ ok: true, failed: true, insufficientCredits: true });
      }
      reservationId = reservation.reservationId;
    }

    // Reference images (optional, up to MAX_REFERENCE_IMAGES) — downloaded
    // in parallel; each one is independently best-effort, so one bad
    // image never blocks the others or the generation itself.
    const downloadedImages = await Promise.all(
      referenceImagePaths.map((path) => downloadReferenceImage(supabase, path, "/api/websites/generate/process"))
    );
    const successfulPaths: string[] = [];
    const referenceImages: ReferenceImage[] = [];
    referenceImagePaths.forEach((path, i) => {
      const image = downloadedImages[i];
      if (image) {
        successfulPaths.push(path);
        referenceImages.push(image);
      }
    });

    // Progressive live preview: throttled to at most once every 1.5s (a
    // DB write per streamed token would be wasteful and unnecessary — the
    // client only polls /api/websites/status every 2.5s anyway, see
    // website-builder-workspace.tsx) so the polling client can render the
    // HTML "being written" in real time instead of staring at a static
    // spinner for however long a large generation takes. Best-effort and
    // fire-and-forget: a dropped/overlapping partial write here can never
    // fail the actual generation, and the next tick's write simply
    // overwrites it with more complete text.
    const PARTIAL_SAVE_THROTTLE_MS = 1500;
    let lastPartialSaveAt = 0;
    const onDelta = (accumulatedText: string) => {
      const now = Date.now();
      if (now - lastPartialSaveAt < PARTIAL_SAVE_THROTTLE_MS) return;
      lastPartialSaveAt = now;
      void supabase.from("user_websites").update({ html_content: accumulatedText }).eq("id", websiteId);
    };

    // The form submission endpoint for THIS website — always resolvable
    // at this point since the row (and therefore its id) already exists
    // (see api/websites/generate/route.ts, which creates it before this
    // route ever runs). See lib/website-builder.ts's
    // FUNCTIONAL_ELEMENTS_SECTION for how the model uses it.
    const formEndpointUrl = `${getSiteUrl()}/api/websites/${websiteId}/submit-form`;

    let htmlContent: string;
    let isFlagged = false;
    let flaggedSummary = "";
    try {
      void recordAiCallForDailySpend(
        estimateWebsiteGenerationCost({ descriptionLength: description.length, imageCount: referenceImages.length })
      );
      htmlContent = await generateWebsiteHtml(
        apiKey,
        description,
        referenceImages,
        onDelta,
        formEndpointUrl,
        costs
      );
      // Real-photo placeholder resolution (Unsplash if configured, else
      // picsum.photos) — see lib/website-image-resolver.ts. A no-op when
      // the model didn't emit any PLACEHOLDER:<slug> images, which is the
      // common case for a description that didn't ask for real photos.
      htmlContent = await resolveWebsiteImagePlaceholders(htmlContent);

      // AI Output Protection Layer — defense in depth beyond the
      // sandboxed preview iframe (sandbox="", the strictest possible
      // setting: no scripts, no same-origin, nothing executes there
      // regardless of HTML content). This matters for the DOWNLOADED
      // file, which a user can host anywhere with no sandbox at all.
      // Layer 1 (free, no AI call): strips any external <script src> the
      // model might have emitted despite the system prompt forbidding
      // it, then scans the result for anything else structurally
      // disallowed (lib/website-html-security-scan.ts). Layer 2 (small,
      // cheap AI call, folded into this SAME already-charged generation
      // — never a separate credit charge): a semantic review for
      // phishing/impersonation/deceptive content the regex scan cannot
      // detect (lib/website-security-review.ts). Both layers run every
      // single generation, unconditionally — this is not an opt-in
      // toggle.
      htmlContent = stripDisallowedExternalScripts(htmlContent);
      const securityIssues = scanWebsiteHtmlForSecurityIssues(htmlContent);
      const contentReview = await reviewWebsiteContentSafety(apiKey, htmlContent, costs);

      const allIssueDescriptions = [
        ...securityIssues.map(describeSecurityScanIssue),
        ...contentReview.concerns,
      ];
      isFlagged = allIssueDescriptions.length > 0;
      flaggedSummary = allIssueDescriptions.join("; ");

      void logSecurityCheck(supabase, {
        userId: user.id,
        resourceType: "website",
        resourceId: websiteId,
        result: {
          passed: !isFlagged,
          checks: ["static HTML scan (script/iframe/handler/form/eval)", "AI content-safety review"],
          issues: allIssueDescriptions,
        },
      });

      if (isFlagged) {
        logApiError("/api/websites/generate/process", "generated HTML flagged by AI Output Protection Layer", {
          websiteId,
          issues: flaggedSummary,
        });
      }
    } catch (err) {
      logApiError("/api/websites/generate/process", err, { stage: "anthropic_call" });
      // Release, not settle: the route's user-facing promise on a failed
      // generation has always been "No credits were charged", and the old
      // deductCredits call was likewise never reached on this path. The
      // hold goes straight back to the balance.
      await releaseReservation(user.id, reservationId);
      const errMessage = err instanceof Error ? err.message : "The website generation request failed.";
      await supabase
        .from("user_websites")
        .update({
          status: "failed",
          error_message: `${errMessage} No credits were charged — please try again.`,
        })
        .eq("id", websiteId);
      return NextResponse.json({ ok: true, failed: true });
    }

    // A flagged website still WAS generated (real tokens spent, real
    // output produced) — it just doesn't pass the AI Output Protection
    // Layer, so it's saved with status 'flagged' rather than 'completed'
    // and html_content is not rendered as a normal finished site.
    // error_message carries a user-facing summary of what was found, and
    // (see api/websites/generate/route.ts) the user gets exactly one
    // free, no-extra-charge regenerate attempt for this row.
    const { data: updatedRecord, error: updateError } = await supabase
      .from("user_websites")
      .update({
        html_content: htmlContent,
        // Still "processing" here on purpose. The client polls this row
        // and, the moment it stops being pending/processing, refreshes the
        // credits counter — but settlement runs BELOW this update, so
        // flipping to "completed" now let the client read the balance
        // before the charge had landed. That is why the counter appeared
        // not to move until a manual reload. The final status is written
        // after settlement instead.
        status: "processing",
        error_message: isFlagged
          ? `This website was flagged by our safety review and can't be published as-is: ${flaggedSummary}. You can regenerate it once at no extra charge.`
          : null,
      })
      .eq("id", websiteId)
      .select()
      .single();

    if (updateError) {
      logApiError("/api/websites/generate/process", updateError, { stage: "update" });
      await releaseReservation(user.id, reservationId);
      return NextResponse.json({ ok: false, error: "Could not save the generated website. Please try again." }, { status: 500 });
    }

    // Only now — the AI call succeeded AND the result is durably saved —
    // is this confirmed a success worth charging for. The real, final
    // cost is computed from what actually happened (real description
    // length, real successfully-sent image count, real generated HTML
    // length — see lib/website-generation-cost.ts).
    // Settlement replaces the old computeWebsiteGenerationCost() charge,
    // which priced the action from proxies (description length, image
    // count, output length) rather than from what it really cost. Every
    // sub-call is now in `costs`: the generation stream and each of its
    // continuation rounds, plus the AI security review. The charge is
    // ceil(real_cost x margin / effective_credit_price), so the multiplier
    // holds no matter how the generation actually went.
    //
    // Settlement also runs for bypass accounts (admins, beta testers) with
    // bypassCharge — they charge nothing, but their real spend still lands
    // in the cost log, which is the only way the margin report reflects
    // total AI spend rather than only billed spend.
    const settlement = await settleReservation({
      userId: user.id,
      reservationId,
      feature: "website_generate",
      costs,
      plan,
      bypassCharge: bypassCredits,
      metadata: {
        websiteId,
        descriptionLength: description.length,
        imageCount: referenceImages.length,
        outputHtmlLength: htmlContent.length,
        estimatedCredits: estimate.estimatedCredits,
        reservedCredits: bypassCredits ? 0 : estimate.reserveCredits,
        flagged: isFlagged,
      },
    });
    // Only now is the row allowed to look finished: the charge has been
    // applied, so a client that reacts to this status reads a balance that
    // already includes it.
    await supabase
      .from("user_websites")
      .update({ status: isFlagged ? "flagged" : "completed" })
      .eq("id", websiteId);

    diagLog(
      `[billing] website_generate settled: ${JSON.stringify({
        userId: user.id,
        websiteId,
        aiCalls: costs.callCount,
        realCostUsd: settlement.realCostUsd,
        creditsCharged: settlement.creditsCharged,
        achievedMargin: settlement.achievedMargin,
        estimatedCredits: estimate.estimatedCredits,
      })}`
    );

    // Version history — this generation is always version 1 for a brand
    // new website. Best-effort: the website itself is already saved above,
    // so a failure here shouldn't fail the whole request.
    const { error: versionError } = await supabase.from("website_versions").insert({
      user_id: user.id,
      website_id: updatedRecord.id,
      version_number: FIRST_VERSION_NUMBER,
      html_content: htmlContent,
    });
    if (versionError) {
      logApiError("/api/websites/generate/process", versionError, { stage: "insert_version" });
    }

    // The reference-image rows are NOT written here any more — they are
    // written by api/websites/generate when the pending row is created,
    // which is what lets this worker read them instead of trusting its
    // caller. Inserting again here would duplicate every row.
    //
    // Any path that failed to download stays recorded: the row is the
    // record of what the user attached to this site, not of what the
    // vision call happened to succeed at reading. Dropping them would make
    // a transient storage hiccup look like the user never attached
    // anything, and would silently change what a later regenerate uses.

    return NextResponse.json({ ok: true, record: updatedRecord });
  } catch (err) {
    logApiError("/api/websites/generate/process", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
