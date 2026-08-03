import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWebsiteHtml, type ReferenceImage } from "@/lib/website-builder";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";
import { downloadReferenceImage } from "@/lib/website-reference-image-server";
import { FIRST_VERSION_NUMBER } from "@/lib/website-versioning";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { deductCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { computeWebsiteGenerationCost, estimateWebsiteGenerationCost } from "@/lib/website-generation-cost";
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
// Credits are deducted HERE, and ONLY after generateWebsiteHtml has
// actually, successfully returned a complete website — never before, and
// never if it throws. This is the fix for the bug where a failed
// generation (network error, timeout, API error) still charged the user:
// previously the deduction ran in the same request as the AI call, before
// the call — see the removed deductCredits() call that used to sit above
// the try/catch around generateWebsiteHtml in the old single-request
// version of this route.
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
    let referenceImagePaths: string[];
    try {
      const body = await request.json();
      websiteId = typeof body?.websiteId === "string" ? body.websiteId : "";
      description =
        typeof body?.description === "string" ? body.description.trim().slice(0, MAX_DESCRIPTION_LENGTH) : "";
      referenceImagePaths = Array.isArray(body?.referenceImagePaths)
        ? body.referenceImagePaths.filter((p: unknown): p is string => typeof p === "string").slice(0, MAX_REFERENCE_IMAGES)
        : [];
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

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
      htmlContent = await generateWebsiteHtml(apiKey, description, referenceImages, onDelta, formEndpointUrl);
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
      const contentReview = await reviewWebsiteContentSafety(apiKey, htmlContent);

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
        status: isFlagged ? "flagged" : "completed",
        error_message: isFlagged
          ? `This website was flagged by our safety review and can't be published as-is: ${flaggedSummary}. You can regenerate it once at no extra charge.`
          : null,
      })
      .eq("id", websiteId)
      .select()
      .single();

    if (updateError) {
      logApiError("/api/websites/generate/process", updateError, { stage: "update" });
      return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
    }

    // Only now — the AI call succeeded AND the result is durably saved —
    // is this confirmed a success worth charging for. The real, final
    // cost is computed from what actually happened (real description
    // length, real successfully-sent image count, real generated HTML
    // length — see lib/website-generation-cost.ts).
    if (!bypassCredits) {
      const plan = await resolveEffectivePlan(user);
      const cost = computeWebsiteGenerationCost({
        descriptionLength: description.length,
        imageCount: referenceImages.length,
        outputHtmlLength: htmlContent.length,
      });
      const deduction = await deductCredits(
        user.id,
        cost,
        "website_generate",
        `Website Builder generation — ${cost} credits (description ${description.length} chars, ${referenceImages.length} image(s), output ${htmlContent.length} chars)`,
        plan
      );
      if (!deduction.ok) {
        // Balance changed between the pre-check in the start route and
        // now (e.g. a concurrent request) — log it, but still deliver the
        // website: the AI cost is already spent, and the user did not
        // cause this race, so taking the finished site away from them
        // would be worse than the missed charge. Matches this codebase's
        // established "cost protection, not a hard financial ledger"
        // tolerance (see lib/billing/credits.ts's deductCredits comment).
        logApiError("/api/websites/generate/process", "credit deduction failed after successful generation", {
          userId: user.id,
          websiteId,
          cost,
        });
      }
    }

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

    // Reference image rows — one per successfully-downloaded image, linked
    // to the now-existing website row. Best-effort, same reasoning as the
    // version-history insert above.
    if (successfulPaths.length > 0) {
      const { error: imagesError } = await supabase.from("website_reference_images").insert(
        successfulPaths.map((imageUrl) => ({
          user_id: user.id,
          website_id: updatedRecord.id,
          image_url: imageUrl,
        }))
      );
      if (imagesError) {
        logApiError("/api/websites/generate/process", imagesError, { stage: "insert_reference_images" });
      }
    }

    return NextResponse.json({ ok: true, record: updatedRecord });
  } catch (err) {
    logApiError("/api/websites/generate/process", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
