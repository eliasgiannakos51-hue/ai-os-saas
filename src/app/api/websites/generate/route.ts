import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { classifyWebsiteDescription } from "@/lib/website-builder";
import { MAX_REFERENCE_IMAGES } from "@/lib/website-reference-image";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import { hasEnoughCredits, insufficientCreditsMessage, resolveEffectivePlan } from "@/lib/billing/credits";
import { estimateWebsiteGenerationCost } from "@/lib/website-generation-cost";
import { checkAiCallAllowed, fingerprintRequest, recordAiCallForDailySpend } from "@/lib/ai-circuit-breaker";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 10000;

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

    // Circuit breaker: independent of credits (see lib/ai-circuit-breaker.ts).
    const breakerCheck = await checkAiCallAllowed(user.id, "website_generate", fingerprintRequest(name, description));
    if (!breakerCheck.allowed) {
      return NextResponse.json({ ok: true, generated: false, rateLimited: true, message: breakerCheck.reason });
    }

    // Off-topic guard — a cheap classification call BEFORE any credits are
    // touched or any row is created, so a request like "write me a poem"
    // costs the user nothing and gets a real, helpful message instead of
    // an AI call that just wraps the poem in an HTML page (see
    // lib/website-builder.ts).
    try {
      void recordAiCallForDailySpend(1);
      const classification = await classifyWebsiteDescription(apiKey, description);
      if (!classification.isWebsiteRequest) {
        return NextResponse.json({ ok: true, generated: false, message: classification.message });
      }
    } catch (err) {
      // Best-effort: a classifier hiccup shouldn't block a real website
      // request, so fall through to normal generation.
      logApiError("/api/websites/generate", err, { stage: "classify_call" });
    }

    // Credits: a READ-ONLY check against a rough pre-generation estimate
    // (lib/website-generation-cost.ts) — rejects early, before creating
    // any row, if the user clearly can't afford it. The REAL charge is
    // computed and deducted in the process route below, only after the
    // website has actually, successfully finished generating — never
    // here, and never if that call fails.
    const isAdmin = isAdminEmail(user.email);
    const bypassCredits = isAdmin || (await hasActiveBetaBypass(user));
    if (!bypassCredits) {
      const plan = await resolveEffectivePlan(user);
      const estimatedCost = estimateWebsiteGenerationCost({
        descriptionLength: description.length,
        imageCount: referenceImagePaths.length,
      });
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

    const { data: record, error: insertError } = await supabase
      .from("user_websites")
      .insert({ user_id: user.id, name, html_content: "", status: "pending" })
      .select()
      .single();

    if (insertError) {
      logApiError("/api/websites/generate", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
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
