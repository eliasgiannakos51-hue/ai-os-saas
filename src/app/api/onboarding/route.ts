import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { activationAvailable } from "@/lib/import/activation";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_GOAL_CHARS = 200;

/** Where the user is in the flow, and whether the free run is still
 *  there. Read-only; the free run is CLAIMED elsewhere, by a conditional
 *  update, precisely so that reading it here can never be mistaken for
 *  reserving it. */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("user_onboarding")
      .select("goal, completed_at, skipped_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      logApiError("/api/onboarding", error, { stage: "read" });
      return NextResponse.json({ ok: false, error: "Could not load your setup." }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      goal: data?.goal ?? null,
      completed: Boolean(data?.completed_at),
      skipped: Boolean(data?.skipped_at),
      activationAvailable: await activationAvailable(user.id),
    });
  } catch (err) {
    logApiError("/api/onboarding", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * Record progress through the flow.
 *
 * `activation_used_at` is deliberately NOT settable here, even though the
 * user owns this row. It decides whether real money is spent for free, so
 * it is written only by `claim_activation_run`, which is granted to
 * service_role alone. Any attempt to set it through this route is ignored
 * because only three keys are ever built into the update.
 */
export async function POST(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const limited = await checkRateLimit({
      scope: "onboarding_progress",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many updates." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);

    const update: Record<string, string | null> = { user_id: user.id };
    if (typeof body?.goal === "string") {
      update.goal = body.goal.trim().slice(0, MAX_GOAL_CHARS) || null;
    }
    if (body?.completed === true) update.completed_at = new Date().toISOString();
    if (body?.skipped === true) update.skipped_at = new Date().toISOString();

    const { error } = await supabase
      .from("user_onboarding")
      .upsert(update, { onConflict: "user_id" });

    if (error) {
      logApiError("/api/onboarding", error, { stage: "upsert" });
      return NextResponse.json({ ok: false, error: "Could not save your setup." }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/onboarding", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
