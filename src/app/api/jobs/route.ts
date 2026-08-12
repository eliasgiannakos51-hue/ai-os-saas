import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isJobKind, jobPercent } from "@/lib/jobs/job-types";

export const dynamic = "force-dynamic";

/**
 * "Do I have a job of this kind still going?"
 *
 * THIS IS WHAT MAKES CLOSING THE PAGE SAFE. The job id lives on the server,
 * so coming back to the page does not depend on the browser having
 * remembered anything. localStorage would have been fewer lines and wrong
 * in three ordinary situations: a different browser, a cleared cache, and
 * a second tab — in each of which the user would be told nothing is running
 * while a worker is spending their credits.
 *
 * Read through the user's own client, so RLS scopes it. There is no way to
 * ask about anyone else's jobs because there is no parameter for it.
 */
export async function GET(request: Request) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });

    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    if (!isJobKind(kind)) {
      return NextResponse.json({ ok: false, error: "Unknown job kind." }, { status: 400 });
    }
    // Unfinished only by default: a page reopening wants the thing still
    // running, not the twenty it has already seen.
    const activeOnly = url.searchParams.get("active") !== "0";

    let query = supabase
      .from("ai_jobs")
      .select("*")
      .eq("kind", kind)
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeOnly) query = query.in("status", ["queued", "running"]);

    const { data, error } = await query;
    if (error) {
      logApiError("/api/jobs", error, { kind });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }

    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    return NextResponse.json({
      ok: true,
      job: row
        ? {
            id: row.id,
            kind: row.kind,
            status: row.status,
            step: row.step ?? 0,
            stepTotal: row.step_total ?? 1,
            stepLabel: row.step_label ?? null,
            percent: jobPercent(Number(row.step ?? 0), Number(row.step_total ?? 1), String(row.status)),
            result: row.result ?? null,
            error: row.error ?? null,
            creditsCharged: row.credits_charged ?? null,
            attempts: row.attempts ?? 0,
            createdAt: row.created_at,
            finishedAt: row.finished_at ?? null,
          }
        : null,
    });
  } catch (err) {
    logApiError("/api/jobs", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
