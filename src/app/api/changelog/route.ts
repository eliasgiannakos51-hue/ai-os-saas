import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { logApiError } from "@/lib/log-error";
import { resolveEffectivePlan } from "@/lib/billing/credits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const MAX_UPDATES = 20;

/**
 * What's new for THIS viewer (V3 Task 13): the newest published updates
 * that target their plan (or everyone), plus which of them they have
 * already seen. The bell badge is the difference of the two.
 *
 * Plan segmentation happens HERE, server-side — the client never
 * receives an update meant for a different plan, so it cannot leak one.
 */
export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    const plan = await resolveEffectivePlan(user);
    const planSlug = plan?.slug ?? "free";

    // RLS already filters to published; the .or() adds the plan cut:
    // untargeted ({} = everyone) OR targeted at the viewer's plan.
    const { data: updates, error } = await supabase
      .from("product_updates")
      .select("id, title, description, type, published_at")
      .or(`target_plans.eq.{},target_plans.cs.{${planSlug}}`)
      .order("published_at", { ascending: false })
      .limit(MAX_UPDATES);

    if (error) {
      logApiError("/api/changelog", error, { stage: "list" });
      return NextResponse.json({ ok: false, error: "Could not load updates." }, { status: 500 });
    }

    const { data: views } = await supabase
      .from("product_update_views")
      .select("update_id")
      .eq("user_id", user.id);
    const seen = new Set((views ?? []).map((v) => v.update_id));

    return NextResponse.json({
      ok: true,
      updates: (updates ?? []).map((u) => ({
        id: u.id,
        title: u.title,
        description: u.description,
        type: u.type,
        publishedAt: u.published_at,
        seen: seen.has(u.id),
      })),
    });
  } catch (err) {
    logApiError("/api/changelog", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/** Mark updates seen — the tracking half of "ποιοι το είδαν". */
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
      scope: "changelog_seen",
      identifier: user.id,
      maxAttempts: 60,
      windowMinutes: 60,
    });
    if (!limited.allowed) {
      return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
    }

    const body = await request.json().catch(() => null);
    const ids: string[] = Array.isArray(body?.updateIds)
      ? body.updateIds.filter((v: unknown) => typeof v === "string").slice(0, MAX_UPDATES)
      : [];
    if (ids.length === 0) {
      return NextResponse.json({ ok: false, error: "Nothing to mark." }, { status: 400 });
    }

    const { error } = await supabase
      .from("product_update_views")
      .upsert(
        ids.map((id) => ({ user_id: user.id, update_id: id })),
        { onConflict: "user_id,update_id", ignoreDuplicates: true }
      );

    if (error) {
      logApiError("/api/changelog", error, { stage: "mark_seen" });
      return NextResponse.json({ ok: false, error: "Could not save." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/changelog", err, {});
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
