import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editWebsiteHtml } from "@/lib/website-builder";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";
import { downloadReferenceImages } from "@/lib/website-reference-image-server";
import { resolveWebsiteImagePlaceholders } from "@/lib/website-image-resolver";
import { scanWebsiteHtmlForSecurityIssues, stripDisallowedExternalScripts } from "@/lib/website-html-security-scan";
import { getSiteUrl } from "@/lib/site-url";
import { nextVersionNumber } from "@/lib/website-versioning";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  CREDIT_COSTS,
  deductCredits,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
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

    // Credits: checked (read-only) BEFORE the AI call so an obviously
    // insufficient balance is rejected early without ever calling Claude,
    // but only actually DEDUCTED after that call has confirmed-
    // successfully returned an updated website — see the deductCredits
    // call further below. If editWebsiteHtml throws (network error,
    // timeout, API error, anything), the catch block returns without
    // ever calling deductCredits, so zero credits are charged.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;
    if (!bypassCredits) {
      plan = await resolveEffectivePlan(user);
      const check = await hasEnoughCredits(user.id, CREDIT_COSTS.websiteEdit, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: true,
          edited: false,
          rateLimited: true,
          message: insufficientCreditsMessage(check.remaining, CREDIT_COSTS.websiteEdit),
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

    let updatedHtml: string;
    try {
      void recordAiCallForDailySpend(CREDIT_COSTS.websiteEdit);
      updatedHtml = await editWebsiteHtml(apiKey, website.html_content, changeRequest, referenceImages, formEndpointUrl);
      updatedHtml = await resolveWebsiteImagePlaceholders(updatedHtml);
      updatedHtml = stripDisallowedExternalScripts(updatedHtml);
      const securityIssues = scanWebsiteHtmlForSecurityIssues(updatedHtml);
      if (securityIssues.length > 0) {
        logApiError("/api/websites/edit", "edited HTML flagged by security scan", {
          websiteId,
          issues: JSON.stringify(securityIssues),
        });
      }
    } catch (err) {
      logApiError("/api/websites/edit", err, { stage: "anthropic_call" });
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
      return NextResponse.json(
        { ok: false, error: `${updateError.message} No credits were charged — please try again.` },
        { status: 500 }
      );
    }

    // Only now — the AI call succeeded AND the result is durably saved —
    // is this confirmed a success worth charging for.
    if (!bypassCredits && plan) {
      const deduction = await deductCredits(
        user.id,
        CREDIT_COSTS.websiteEdit,
        "website_edit",
        "Website Builder edit",
        plan
      );
      if (!deduction.ok) {
        // Balance changed between the pre-check above and now — log it,
        // but still deliver the edit: the AI cost is already spent, and
        // taking the finished result away would be worse than the missed
        // charge (see the same tolerance documented on deductCredits).
        logApiError("/api/websites/edit", "credit deduction failed after successful edit", {
          userId: user.id,
          websiteId,
        });
      }
    }

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

    return NextResponse.json({ ok: true, edited: true, record: updatedRecord });
  } catch (err) {
    logApiError("/api/websites/edit", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
