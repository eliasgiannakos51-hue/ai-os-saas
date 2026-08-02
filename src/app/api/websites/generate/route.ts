import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateWebsiteHtml } from "@/lib/website-builder";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  CREDIT_COSTS,
  deductCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;

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
    try {
      const body = await request.json();
      name = typeof body?.name === "string" ? body.name.trim().slice(0, MAX_NAME_LENGTH) : "";
      description = typeof body?.description === "string" ? body.description.trim() : "";
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

    let htmlContent: string;
    try {
      htmlContent = await generateWebsiteHtml(apiKey, description);
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

    return NextResponse.json({ ok: true, generated: true, record });
  } catch (err) {
    logApiError("/api/websites/generate", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
