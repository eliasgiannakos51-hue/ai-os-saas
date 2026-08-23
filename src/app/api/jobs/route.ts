import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { isJobKind, isJobStale, jobPercent } from "@/lib/jobs/job-types";
import { pickResumableJob } from "@/lib/jobs/resumable";
import { reapJob } from "@/lib/jobs/run-job";

export const dynamic = "force-dynamic";

/**
 * "Where was I?" — the query a page runs the moment it opens.
 *
 * THIS IS WHAT MAKES CLOSING THE PAGE SAFE. The job id lives on the server,
 * so coming back to the page does not depend on the browser having
 * remembered anything. localStorage would have been fewer lines and wrong
 * in three ordinary situations: a different browser, a cleared cache, and
 * a second tab — in each of which the user would be told nothing is running
 * while a worker is spending their credits.
 *
 * IT USED TO ANSWER ONLY HALF THE QUESTION, and the missing half cost
 * money. The filter was `status in ('queued','running')`, so a job that
 * FINISHED while the user was on another page came back as "nothing here".
 * The draft existed and was paid for; the page just could not see it. The
 * user's only available move was to ask for the same thing again — a
 * second real charge for work already done and already bought.
 *
 * So a finished result is offered too, under two conditions that are both
 * about not replacing one annoyance with another (see lib/jobs/resumable):
 * only until it has been seen, and only for 24 hours.
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
    // active=0 keeps its old meaning: the newest job of this kind whatever
    // its state, seen or not. Nothing in the app uses it — it is the
    // "show me the last one" escape hatch, and the tests use it to prove
    // that a row the resume rule declines to offer is still THERE.
    const activeOnly = url.searchParams.get("active") !== "0";

    if (!activeOnly) {
      const { data, error } = await supabase
        .from("ai_jobs")
        .select("*")
        .eq("kind", kind)
        .order("created_at", { ascending: false })
        .limit(1);
      if (error) {
        logApiError("/api/jobs", error, { kind });
        return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, job: shape((data ?? [])[0]) });
    }

    // TWO NARROW QUERIES, NOT ONE CLEVER ONE.
    //
    // A single `or=(status.in.(queued,running),and(consumed_at.is.null,…))`
    // would be one round trip and one filter nobody can read six months
    // from now. Worse, it makes the un-migrated case fatal: PostgREST
    // fails the WHOLE query when a filtered column does not exist, so a
    // deployment that shipped before the SQL was applied would 500 on
    // every page open rather than degrade to the old behaviour.
    //
    // Split, the second query is the only one that names the new column,
    // and its failure costs exactly the feature it powers.
    const { data: activeRows, error: activeError } = await supabase
      .from("ai_jobs")
      .select("*")
      .eq("kind", kind)
      .in("status", ["queued", "running"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (activeError) {
      logApiError("/api/jobs", activeError, { kind });
      return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
    }

    // Newest finished job of this kind that has never been shown. The 24
    // hour window is applied by pickResumableJob rather than here, so the
    // rule lives in one testable place instead of half in SQL.
    let unseenRow: Record<string, unknown> | undefined;
    const { data: unseenRows, error: unseenError } = await supabase
      .from("ai_jobs")
      .select("*")
      .eq("kind", kind)
      .eq("status", "done")
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    if (unseenError) {
      // The un-migrated case, and the only one that is not an outage: the
      // column is not there yet. Degrade to "active only" — which is the
      // behaviour that shipped before this feature — rather than failing
      // the page open.
      const missingColumn =
        unseenError.code === "42703" || /consumed_at/.test(unseenError.message ?? "");
      if (!missingColumn) {
        logApiError("/api/jobs", unseenError, { kind });
        return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
      }
      logApiError("/api/jobs", unseenError, {
        kind,
        hint: "run supabase/migrations/20260814_job_consumed_at.sql — finished results cannot be resumed until then",
      });
    } else {
      unseenRow = (unseenRows ?? [])[0] as Record<string, unknown> | undefined;
    }

    // A DEAD "ACTIVE" ROW IS REAPED HERE, not left to mask a finished build.
    //
    // The reaper already lives on the per-job poll (api/jobs/[id]) for the
    // same reason it lives anywhere: a worker killed by the platform writes
    // nothing, so the row sits at "running" forever with the credit hold
    // still on it. But that poll only runs for a job the page ADOPTED —
    // and until pickResumableJob learned about staleness, adopting the
    // corpse was exactly what happened, and the completed build behind it
    // was never shown. Reaping it here refunds the hold now AND takes it
    // out of the running, so the finished result is what comes back.
    let activeRow = (activeRows ?? [])[0] as Record<string, unknown> | undefined;
    if (
      activeRow &&
      isJobStale(
        String(activeRow.status),
        (activeRow.updated_at as string | null) ?? null,
        (activeRow.created_at as string | null) ?? null
      )
    ) {
      const reaped = await reapJob({
        id: String(activeRow.id),
        user_id: String(activeRow.user_id),
        status: String(activeRow.status),
        reservation_id: (activeRow.reservation_id as string | null) ?? null,
      });
      if (reaped) {
        activeRow = { ...activeRow, status: "failed", error: "stalled", credits_charged: 0 };
      }
    }

    const row = pickResumableJob([activeRow, unseenRow]);

    return NextResponse.json({ ok: true, job: shape(row) });
  } catch (err) {
    logApiError("/api/jobs", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}

/**
 * The row as the client reads it.
 *
 * `input` is included, and only here. A page resuming a FINISHED job needs
 * what was asked as well as what came back: the Agents workspace restores
 * the sentence the user typed, without which answering the builder's
 * clarifying questions would send the answers with no question attached.
 * It is the user's own request, read through their own RLS-scoped client,
 * so this exposes nothing they did not write.
 */
function shape(row: Record<string, unknown> | undefined | null) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    step: row.step ?? 0,
    stepTotal: row.step_total ?? 1,
    stepLabel: row.step_label ?? null,
    percent: jobPercent(Number(row.step ?? 0), Number(row.step_total ?? 1), String(row.status)),
    input: row.input ?? null,
    result: row.result ?? null,
    error: row.error ?? null,
    creditsCharged: row.credits_charged ?? null,
    attempts: row.attempts ?? 0,
    createdAt: row.created_at,
    finishedAt: row.finished_at ?? null,
    consumedAt: row.consumed_at ?? null,
  };
}
