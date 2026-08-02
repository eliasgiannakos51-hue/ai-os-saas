import { NextResponse } from "next/server";
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
import { computeWebsiteGenerationCost } from "@/lib/website-generation-cost";
import { logApiError } from "@/lib/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MAX_DESCRIPTION_LENGTH = 10000;

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
    return { base64: Buffer.from(arrayBuffer).toString("base64"), mediaType: imageBlob.type };
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

    // RLS (select_own_user_websites) already scopes this to the caller's
    // own row — a stranger's websiteId simply won't be found.
    const { data: website, error: fetchError } = await supabase
      .from("user_websites")
      .select("id, status")
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

    await supabase.from("user_websites").update({ status: "processing" }).eq("id", websiteId);

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

    let htmlContent: string;
    try {
      htmlContent = await generateWebsiteHtml(apiKey, description, referenceImages);
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
