import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { editWebsiteHtml } from "@/lib/website-builder";
import {
  describeSecurityScanIssue,
  scanWebsiteHtmlForSecurityIssues,
  stripDisallowedExternalScripts,
} from "@/lib/website-html-security-scan";
import { reviewWebsiteContentSafety } from "@/lib/website-security-review";
import { resolveWebsiteImagePlaceholders } from "@/lib/website-image-resolver";
import { logSecurityCheck } from "@/lib/security-check-log";
import { computeWebsiteEditCost, estimateWebsiteEditCost } from "@/lib/website-edit-cost";
import { MAX_LIVE_EDITS_PER_SITE_PER_DAY } from "@/lib/publishing/publish-limits";
import { nextSiteVersion, pruneSiteVersions } from "@/lib/publishing/site-versions";
import { checkRateLimit } from "@/lib/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  deductCredits,
  hasEnoughCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_CHANGE_REQUEST_LENGTH = 20000;
// A generated document can be long; the apply step re-sends it, so cap
// what we accept back to the same ceiling the generator can produce.
const MAX_HTML_LENGTH = 400_000;

/**
 * Live website editing (V3 Task 12).
 *
 * Edits an ALREADY-PUBLISHED site with a proper preview-then-approve
 * flow, in two modes on one route:
 *
 *   mode "preview" — generate the change from the LIVE html, run the full
 *     security review, and return the proposed HTML WITHOUT touching the
 *     live page. This is the split view's right-hand pane. The AI work
 *     happened, so this is the charged step.
 *
 *   mode "apply" — the user approved. Take the proposed HTML back, re-run
 *     the deterministic static security scan on the exact bytes about to
 *     be written (the client is untrusted — a preview result cannot be
 *     trusted to arrive unmodified), snapshot it as a version, and write
 *     it live. No new AI call, no new charge.
 *
 * Two invariants hold across both modes:
 *   1. NOTHING REACHES THE PUBLIC PAGE WITHOUT A SECURITY SCAN. Preview
 *      runs the static scan plus the AI content review; apply re-runs the
 *      static scan (which is what blocks scripts, iframes, inline
 *      handlers and dynamic code) fail-closed on the submitted bytes.
 *   2. EVERY LIVE STATE IS A VERSION, snapshotted before the visible
 *      content changes and pruned to MAX_SITE_VERSIONS, so rollback means
 *      "what the public actually saw" and a bad edit is one click undone.
 *
 * Cost is small by construction: editWebsiteHtml tries a cache-primed
 * diff/patch first and only regenerates the whole document for a
 * structural change; the common small edit re-sends the page as cached
 * input and writes a few tokens. Bounded by MAX_LIVE_EDITS_PER_SITE_PER_DAY.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const publishedSiteId = params.id;
    if (!publishedSiteId) {
      return NextResponse.json({ ok: false, error: "Missing site id." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // The per-site-per-day ceiling counts LIVE updates, so it is charged
    // on apply (the write), not on preview (which changes nothing public).
    let mode: "preview" | "apply";
    let changeRequest = "";
    let proposedHtml = "";
    try {
      const body = await request.json();
      mode = body?.mode === "apply" ? "apply" : "preview";
      changeRequest =
        typeof body?.changeRequest === "string" ? body.changeRequest.trim().slice(0, MAX_CHANGE_REQUEST_LENGTH) : "";
      proposedHtml = typeof body?.html === "string" ? body.html.slice(0, MAX_HTML_LENGTH) : "";
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    const { data: site } = await supabase
      .from("published_sites")
      .select("id, website_id, html_content, status")
      .eq("id", publishedSiteId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!site) {
      return NextResponse.json({ ok: false, error: "Site not found." }, { status: 404 });
    }

    if (mode === "apply") {
      return applyLiveEdit({ supabase, user, site, publishedSiteId, changeRequest, proposedHtml });
    }

    // --- preview mode: generate + full security review, write nothing ---
    if (changeRequest.length < 3) {
      return NextResponse.json({ ok: false, error: "Describe the change you want." }, { status: 400 });
    }

    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    const estimatedEditCost = estimateWebsiteEditCost(site.html_content.length);
    let plan: Awaited<ReturnType<typeof resolveEffectivePlan>> | null = null;
    if (!bypassCredits) {
      plan = await resolveEffectivePlan(user);
      const check = await hasEnoughCredits(user.id, estimatedEditCost, plan);
      if (!check.ok) {
        return NextResponse.json({
          ok: false,
          rateLimited: true,
          error: insufficientCreditsMessage(check.remaining, estimatedEditCost),
        });
      }
    }

    const formEndpointUrl = `${getSiteUrl()}/api/websites/${site.website_id}/submit-form`;
    let html: string;
    let usedCheapPatch = false;
    try {
      void recordAiCallForDailySpend(estimatedEditCost);
      const editResult = await editWebsiteHtml(apiKey, site.html_content, changeRequest, [], formEndpointUrl);
      html = await resolveWebsiteImagePlaceholders(editResult.html);
      usedCheapPatch = editResult.usedCheapPatch;

      html = stripDisallowedExternalScripts(html);
      const staticIssues = scanWebsiteHtmlForSecurityIssues(html);
      const contentReview = await reviewWebsiteContentSafety(apiKey, html);
      const allIssues = [...staticIssues.map(describeSecurityScanIssue), ...contentReview.concerns];
      void logSecurityCheck(supabase, {
        userId: user.id,
        resourceType: "website",
        resourceId: site.website_id,
        result: {
          passed: allIssues.length === 0,
          checks: ["pre-live static scan (script/iframe/handler/form/eval)", "AI content-safety review"],
          issues: allIssues,
        },
      });
      if (allIssues.length > 0) {
        return NextResponse.json({
          ok: false,
          securityBlocked: true,
          issues: allIssues,
          error: `This change was blocked by the security review: ${allIssues.join("; ")}. Nothing was applied and no credits were charged.`,
        });
      }
    } catch (err) {
      logApiError("/api/published/[id]/live-edit", err, { stage: "generate" });
      return NextResponse.json(
        { ok: false, error: "The change could not be generated. No credits were charged." },
        { status: 502 }
      );
    }

    // The preview is what was charged for — the AI ran.
    const cost = computeWebsiteEditCost({ usedCheapPatch, outputHtmlLength: html.length });
    if (!bypassCredits && plan) {
      const deduction = await deductCredits(
        user.id,
        cost,
        "website_live_edit",
        `Live edit preview — ${cost} credits (${usedCheapPatch ? "cheap patch" : `full regeneration, output ${html.length} chars`})`,
        plan
      );
      if (!deduction.ok) {
        logApiError("/api/published/[id]/live-edit", "deduction failed after preview", { userId: user.id });
      }
    }

    return NextResponse.json({ ok: true, mode: "preview", html, usedCheapPatch, creditsCharged: bypassCredits ? 0 : cost });
  } catch (err) {
    logApiError("/api/published/[id]/live-edit", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

async function applyLiveEdit(args: {
  supabase: ReturnType<typeof createClient>;
  user: { id: string };
  site: { website_id: string; html_content: string };
  publishedSiteId: string;
  changeRequest: string;
  proposedHtml: string;
}): Promise<Response> {
  const { supabase, user, site, publishedSiteId, changeRequest, proposedHtml } = args;

  if (!proposedHtml || proposedHtml.length < 40) {
    return NextResponse.json({ ok: false, error: "Nothing to apply — preview a change first." }, { status: 400 });
  }

  // The write ceiling is charged here, where the public page actually
  // changes — a preview that is never applied costs no daily budget.
  const limited = await checkRateLimit({
    scope: "site_publish",
    identifier: user.id,
    maxAttempts: MAX_LIVE_EDITS_PER_SITE_PER_DAY,
    windowMinutes: 24 * 60,
  });
  if (!limited.allowed) {
    return NextResponse.json(
      { ok: false, error: "You've published a lot of changes today. Try again tomorrow." },
      { status: 429 }
    );
  }

  // NEVER trust the submitted HTML. Re-run the deterministic static scan
  // on the exact bytes about to go live — this is what blocks the
  // injection vectors, and it is free. A tampered preview that tries to
  // slip a <script> past the client is caught here, fail-closed.
  const html = stripDisallowedExternalScripts(proposedHtml);
  const staticIssues = scanWebsiteHtmlForSecurityIssues(html);
  if (staticIssues.length > 0) {
    const described = staticIssues.map(describeSecurityScanIssue);
    void logSecurityCheck(supabase, {
      userId: user.id,
      resourceType: "website",
      resourceId: site.website_id,
      result: { passed: false, checks: ["pre-live static scan on apply"], issues: described },
    });
    return NextResponse.json(
      {
        ok: false,
        securityBlocked: true,
        issues: described,
        error: `This change can't go live — the security check flagged it: ${described.join("; ")}.`,
      },
      { status: 422 }
    );
  }

  const versionNumber = await nextSiteVersion(supabase, publishedSiteId);
  const nowIso = new Date().toISOString();
  const { error: versionError } = await supabase.from("site_versions").insert({
    published_site_id: publishedSiteId,
    user_id: user.id,
    html_content: html,
    version_number: versionNumber,
    change_description: changeRequest || "live edit",
    published_at: nowIso,
  });
  if (versionError) {
    logApiError("/api/published/[id]/live-edit", versionError, { stage: "insert_version" });
  }

  const { error: updateError } = await supabase
    .from("published_sites")
    .update({ html_content: html, updated_at: nowIso })
    .eq("id", publishedSiteId)
    .eq("user_id", user.id);
  if (updateError) {
    logApiError("/api/published/[id]/live-edit", updateError, { stage: "update_live" });
    return NextResponse.json({ ok: false, error: "Could not apply the change." }, { status: 500 });
  }
  await pruneSiteVersions(supabase, publishedSiteId);

  // No charge on apply: the AI cost was billed at preview time, and apply
  // makes no model call.
  return NextResponse.json({ ok: true, mode: "apply", versionNumber });
}
