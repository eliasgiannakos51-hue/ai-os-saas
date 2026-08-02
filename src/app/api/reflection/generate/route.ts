import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeeklyReflectionStats } from "@/lib/reflection";
import { buildReflectionUserMessage, generateWeeklyReflection } from "@/lib/reflection-agent";
import { logApiError } from "@/lib/log-error";
import { isAdminEmail } from "@/lib/admin";
import { hasActiveBetaBypass } from "@/lib/beta";
import {
  CREDIT_COSTS,
  deductCredits,
  insufficientCreditsMessage,
  resolveEffectivePlan,
} from "@/lib/billing/credits";

export const dynamic = "force-dynamic";

// On-demand Weekly Reflection: computes real this-week-vs-last-week stats
// (lib/reflection.ts) across every module and every mission, then hands
// them to the Reflection Agent (lib/reflection-agent.ts) for a short,
// honest synthesis. No request body — every call reflects the account's
// current data as of right now, nothing is persisted.
export async function POST() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
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
        CREDIT_COSTS.weeklyReflection,
        "weekly_reflection",
        "Weekly Reflection",
        plan
      );
      if (!deduction.ok) {
        return NextResponse.json({
          ok: true,
          generated: false,
          rateLimited: true,
          message: insufficientCreditsMessage(deduction.remaining, CREDIT_COSTS.weeklyReflection),
        });
      }
    }

    const stats = await loadWeeklyReflectionStats(supabase, user.id);
    const userMessage = buildReflectionUserMessage(stats);

    let reflection: string;
    try {
      reflection = await generateWeeklyReflection(apiKey, userMessage);
    } catch (err) {
      logApiError("/api/reflection/generate", err, { stage: "reflection_call" });
      const errMessage = err instanceof Error ? err.message : "The reflection request failed.";
      return NextResponse.json({ ok: false, error: errMessage }, { status: 502 });
    }

    return NextResponse.json({ ok: true, generated: true, reflection, stats });
  } catch (err) {
    logApiError("/api/reflection/generate", err);
    return NextResponse.json(
      { ok: false, error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }
}
