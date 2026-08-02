import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  classifyWebsiteDescription,
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
import {
  CREDIT_COSTS,
  deductCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";
import type { SupabaseClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;

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
      logApiError("/api/websites/generate", downloadError, { stage: "reference_image_download" });
      return null;
    }
    if (imageBlob.size > MAX_REFERENCE_IMAGE_BYTES) {
      logApiError("/api/websites/generate", "reference image exceeds size limit after upload", {
        stage: "reference_image_size",
      });
      return null;
    }
    if (!isSupportedReferenceImageMediaType(imageBlob.type)) {
      logApiError("/api/websites/generate", `unsupported reference image type: ${imageBlob.type}`, {
        stage: "reference_image_type",
      });
      return null;
    }

    const arrayBuffer = await imageBlob.arrayBuffer();
    return { base64: Buffer.from(arrayBuffer).toString("base64"), mediaType: imageBlob.type };
  } catch (err) {
    logApiError("/api/websites/generate", err, { stage: "reference_image_download" });
    return null;
  }
}

// Website Builder — real Claude generation (lib/website-builder.ts), saved
// to user_websites. Distinct from /api/modules/create's "websites" Build
// module (ai_websites table), which is a plain CRUD tracker with no AI
// call — see dashboard/website-builder/page.tsx for why this lives at a
// different route.
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
    try {
      const body = await request.json();
      name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
      description = typeof body?.description === "string" ? body.description.trim() : "";
      referenceImagePaths = Array.isArray(body?.referenceImagePaths)
        ? body.referenceImagePaths.filter((p: unknown): p is string => typeof p === "string").slice(0, MAX_REFERENCE_IMAGES)
        : [];
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

    // Off-topic guard — a cheap classification call BEFORE any credits are
    // deducted, so a request like "write me a poem" costs the user
    // nothing and gets a real, helpful message instead of an AI call that
    // just wraps the poem in an HTML page (see lib/website-builder.ts).
    try {
      const classification = await classifyWebsiteDescription(apiKey, description);
      if (!classification.isWebsiteRequest) {
        return NextResponse.json({ ok: true, generated: false, message: classification.message });
      }
    } catch (err) {
      // Best-effort: a classifier hiccup shouldn't block a real website
      // request, so fall through to normal generation.
      logApiError("/api/websites/generate", err, { stage: "classify_call" });
    }

    const isAdmin = isAdminEmail(user.email);
    if (!isAdmin && !(await hasActiveBetaBypass(user))) {
      const plan = await resolveEffectivePlan(user);
      const deduction = await deductCredits(
        user.id,
        CREDIT_COSTS.websiteGenerate,
        "website_generate",
        "Website Builder generation",
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json({
          ok: true,
          generated: false,
          rateLimited: true,
          message: insufficientCreditsMessage(deduction.remaining, CREDIT_COSTS.websiteGenerate),
        });
      }
    }

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
      logApiError("/api/websites/generate", err, { stage: "anthropic_call" });
      const errMessage = err instanceof Error ? err.message : "The website generation request failed.";
      return NextResponse.json({ ok: false, error: errMessage }, { status: 502 });
    }

    const { data: record, error: insertError } = await supabase
      .from("user_websites")
      .insert({ user_id: user.id, name, html_content: htmlContent })
      .select()
      .single();

    if (insertError) {
      logApiError("/api/websites/generate", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    // Version history — this generation is always version 1 for a brand
    // new website. Best-effort: the website itself is already saved above,
    // so a failure here shouldn't fail the whole request.
    const { error: versionError } = await supabase.from("website_versions").insert({
      user_id: user.id,
      website_id: record.id,
      version_number: FIRST_VERSION_NUMBER,
      html_content: htmlContent,
    });
    if (versionError) {
      logApiError("/api/websites/generate", versionError, { stage: "insert_version" });
    }

    // Reference image rows — one per successfully-downloaded image, linked
    // to the now-existing website row. Best-effort, same reasoning as the
    // version-history insert above.
    if (successfulPaths.length > 0) {
      const { error: imagesError } = await supabase.from("website_reference_images").insert(
        successfulPaths.map((imageUrl) => ({
          user_id: user.id,
          website_id: record.id,
          image_url: imageUrl,
        }))
      );
      if (imagesError) {
        logApiError("/api/websites/generate", imagesError, { stage: "insert_reference_images" });
      }
    }

    return NextResponse.json({ ok: true, generated: true, record });
  } catch (err) {
    logApiError("/api/websites/generate", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
