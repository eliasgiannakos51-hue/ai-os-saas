import { NextResponse } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import {
  generateWebsiteHtml,
  isSupportedReferenceImageMediaType,
  type ReferenceImage,
} from "@/lib/website-builder";
import {
  MAX_REFERENCE_IMAGE_BYTES,
  MAX_REFERENCE_IMAGES,
  REFERENCE_IMAGE_BUCKET,
} from "@/lib/website-reference-image";
import { FIRST_VERSION_NUMBER } from "@/lib/website-versioning";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { deductCredits, resolveEffectivePlan } from "@/lib/billing/credits";
import { computeWebsiteGenerationCost, estimateWebsiteGenerationCost } from "@/lib/website-generation-cost";
import { MAX_GENERATION_ATTEMPTS } from "@/lib/website-generation-limits";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";

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
// 600s (10 min) requires a hosting tier that supports long-running
// serverless functions — on Vercel this means Pro or Enterprise with
// Fluid Compute; the previous 300s value hit exactly this ceiling on
// complex, image-attached generations in production (confirmed via the
// "stale website generation job force-failed" log line, WITHOUT any
// credit being charged — the safety net worked, it just fired too
// early). STALE_JOB_TIMEOUT_WITH_IMAGES_MS in
// lib/website-generation-limits.ts is set with headroom above this, so
// this route's own timeout is what kills a truly stuck job first; the
// stale-job check is purely the client-visible backstop for on the rare
// chance even that fails to run its course.
export const maxDuration = 600;

const MAX_DESCRIPTION_LENGTH = 10000;

// Claude's vision input internally downsamples any image above roughly
// this size before analyzing it (Anthropic docs: ~1.15 megapixels, i.e.
// long-edge around 1568px for a typical aspect ratio) — sending a full
// multi-thousand-pixel phone photo doesn't improve style/color analysis
// quality beyond that point, it only adds base64-encoding size, network
// transfer time, and vision-input processing time before Claude ever
// starts generating the actual website. Shrinking here (dimensions only,
// same format, no extra lossy re-compression) speeds up the request with
// no loss to what the model can actually see.
const REFERENCE_IMAGE_MAX_DIMENSION = 1568;

// Resizes only if the image is actually larger than the target — never
// upscales a smaller image (withoutEnlargement), and any resize failure
// (corrupt file, unsupported edge case) falls back to the original,
// unresized buffer rather than dropping the image entirely.
async function resizeReferenceImageIfNeeded(buffer: Buffer): Promise<Buffer> {
  try {
    const resized = await sharp(buffer)
      .resize({
        width: REFERENCE_IMAGE_MAX_DIMENSION,
        height: REFERENCE_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toBuffer();
    return resized;
  } catch (err) {
    logApiError("/api/websites/generate/process", err, { stage: "reference_image_resize" });
    return buffer;
  }
}

// Downloads one reference image via the request-scoped client (Storage's
// RLS policies — supabase_schema.sql — already confirm this path belongs
// to the caller before anything is read) and validates it. Returns null
// on any problem rather than throwing — one bad image among several
// should never take down the other, valid ones.
async function downloadReferenceImage(
  supabase: SupabaseClient,
  path: string
): Promise<ReferenceImage | null> {
  try {
    const { data: imageBlob, error: downloadError } = await supabase.storage
      .from(REFERENCE_IMAGE_BUCKET)
      .download(path);

    if (downloadError || !imageBlob) {
      logApiError("/api/websites/generate/process", downloadError, { stage: "reference_image_download" });
      return null;
    }
    if (imageBlob.size > MAX_REFERENCE_IMAGE_BYTES) {
      logApiError("/api/websites/generate/process", "reference image exceeds size limit after upload", {
        stage: "reference_image_size",
      });
      return null;
    }
    if (!isSupportedReferenceImageMediaType(imageBlob.type)) {
      logApiError("/api/websites/generate/process", `unsupported reference image type: ${imageBlob.type}`, {
        stage: "reference_image_type",
      });
      return null;
    }

    const arrayBuffer = await imageBlob.arrayBuffer();
    const resizedBuffer = await resizeReferenceImageIfNeeded(Buffer.from(arrayBuffer));
    return { base64: resizedBuffer.toString("base64"), mediaType: imageBlob.type };
  } catch (err) {
    logApiError("/api/websites/generate/process", err, { stage: "reference_image_download" });
    return null;
  }
}

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
      referenceImagePaths.map((path) => downloadReferenceImage(supabase, path))
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

    let htmlContent: string;
    try {
      void recordAiCallForDailySpend(
        estimateWebsiteGenerationCost({ descriptionLength: description.length, imageCount: referenceImages.length })
      );
      htmlContent = await generateWebsiteHtml(apiKey, description, referenceImages, onDelta);
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

    const { data: updatedRecord, error: updateError } = await supabase
      .from("user_websites")
      .update({ html_content: htmlContent, status: "completed", error_message: null })
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
