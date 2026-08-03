import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { computeNextRunAt, isAutomationFrequency } from "@/lib/automation-schedule";
import { logApiError } from "@/lib/log-error";

export const dynamic = "force-dynamic";

const MAX_DESCRIPTION_LENGTH = 2000;
// Safety cap, per the brief: prevents unbounded recurring-cost
// accumulation — each active automation calls Claude on its own
// schedule, indefinitely, with no further approval per run.
const MAX_ACTIVE_AUTOMATIONS = 10;

// "Make this real" (see components/automation/automation-realize-form.tsx)
// — turns an Automation module idea into an actually-scheduled, repeating
// automation. No AI call and no credit charge here; this route only ever
// creates a 'pending-for-its-first-run' row. api/cron/scheduled-runs is
// solely responsible for actually executing it once next_run_at arrives.
export async function POST(request: Request) {
  try {
    let description: string;
    let frequency: string;
    let dayOfWeek: number | null;
    let dayOfMonth: number | null;
    try {
      const body = await request.json();
      description = typeof body?.description === "string" ? body.description.trim() : "";
      frequency = typeof body?.frequency === "string" ? body.frequency : "";
      dayOfWeek = typeof body?.dayOfWeek === "number" ? body.dayOfWeek : null;
      dayOfMonth = typeof body?.dayOfMonth === "number" ? body.dayOfMonth : null;
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
    }

    if (!description) {
      return NextResponse.json({ ok: false, error: "Description is required." }, { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
      return NextResponse.json(
        { ok: false, error: `Description is too long (${description.length}/${MAX_DESCRIPTION_LENGTH} characters).` },
        { status: 400 }
      );
    }
    if (!isAutomationFrequency(frequency)) {
      return NextResponse.json({ ok: false, error: "Invalid frequency." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const { count, error: countError } = await supabase
      .from("user_automations")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    if (countError) {
      logApiError("/api/automations/create", countError, { stage: "count_active" });
      return NextResponse.json({ ok: false, error: countError.message }, { status: 500 });
    }
    if ((count ?? 0) >= MAX_ACTIVE_AUTOMATIONS) {
      return NextResponse.json(
        {
          ok: false,
          limitReached: true,
          error: `You've reached the ${MAX_ACTIVE_AUTOMATIONS} active automation limit — turn one off or delete it before adding another.`,
        },
        { status: 403 }
      );
    }

    const nextRunAt = computeNextRunAt(frequency, new Date(), dayOfWeek, dayOfMonth);

    const { data: automation, error: insertError } = await supabase
      .from("user_automations")
      .insert({
        user_id: user.id,
        description,
        frequency,
        day_of_week: frequency === "weekly" ? dayOfWeek : null,
        day_of_month: frequency === "monthly" ? dayOfMonth : null,
        is_active: true,
        next_run_at: nextRunAt.toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      logApiError("/api/automations/create", insertError, { stage: "insert" });
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, automation });
  } catch (err) {
    logApiError("/api/automations/create", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
