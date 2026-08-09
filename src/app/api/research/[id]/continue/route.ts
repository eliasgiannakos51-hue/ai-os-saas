import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { internalHandoffToken, INTERNAL_HANDOFF_HEADER } from "@/lib/function-limits";
import { runResearchChunk, claimChunk, failChunk } from "@/lib/research/run-research";
import { isResearchJobStale } from "@/lib/research/research-limits";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const maxDuration = 800; // @function-limit 800

// Carries a chunked report on from where the previous invocation stopped.
//
// TWO CALLERS, TWO DIFFERENT AUTHORISATIONS, and the difference matters:
//
//   1. THE HANDOFF. lib/research/run-research.ts calls this on the way out
//      when its budget ran out. That request has no user session — it is
//      our own infrastructure calling itself — so it authenticates with
//      the internal token (CRON_SECRET). This is the path that makes a
//      report finish while the user's tab is closed, which is the whole
//      requirement.
//
//   2. THE NUDGE. The polling client calls this when it sees a report that
//      is running but whose chunk lock is free and whose last chunk went
//      quiet — the safety net for a handoff that never landed (no
//      CRON_SECRET set, a dropped outbound request, a cold start that
//      timed out). That request DOES have a session, and is authorised the
//      normal way: it must own the report.
//
// Either way the work itself is identical, and claimChunk is what stops
// the two racing into two concurrent billed runs.

/** A chunk that claimed the lock and then died leaves it held. Anything
 *  older than this is treated as abandoned so the report is not stuck
 *  behind a lock nobody owns. Generous relative to one chunk's real
 *  budget, so it can never reap a chunk that is genuinely working. */
const CHUNK_LOCK_STALE_MS = 15 * 60 * 1000;

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  const reportId = params.id;

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "The AI service is not configured." }, { status: 503 });
    }

    const expected = internalHandoffToken();
    const presented = request.headers.get(INTERNAL_HANDOFF_HEADER);
    // Constant-time-ish: compare only when both exist, and never reveal
    // which half was wrong.
    const isInternal = Boolean(expected && presented && presented === expected);

    const admin = createAdminClient();

    if (!isInternal) {
      // The nudge path. Must be the report's owner.
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
      }
      const { data: owned } = await supabase
        .from("research_reports")
        .select("id")
        .eq("id", reportId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!owned) {
        // Deliberately the same reply a genuinely missing report gets —
        // a distinct "not yours" would confirm the id exists.
        return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
      }
    }

    const { data: row } = await admin
      .from("research_reports")
      .select("id, user_id, status, chunk_running, chunk_started_at, chunk_count, reservation_id, processing_started_at, created_at")
      .eq("id", reportId)
      .maybeSingle();

    if (!row) {
      return NextResponse.json({ ok: false, error: "Report not found." }, { status: 404 });
    }
    if (row.status !== "researching" && row.status !== "synthesising") {
      // Already finished, failed, or never started. Not an error: a
      // duplicated handoff landing after the job completed is the normal
      // case, not a fault.
      return NextResponse.json({ ok: true, alreadyHandled: true, status: row.status });
    }

    // A whole job that has been running far too long is dead, lock or no
    // lock — same reaping rule the poll endpoint applies, applied here so
    // a nudge cannot resurrect a job that should be failed.
    if (isResearchJobStale(String(row.status), row.processing_started_at ?? null, String(row.created_at), new Date())) {
      await failChunk(reportId, String(row.user_id), (row.reservation_id as string | null) ?? null);
      return NextResponse.json({ ok: true, reaped: true });
    }

    // Someone else holds the chunk lock. Honour it unless it is clearly
    // abandoned — a chunk that claimed and then died would otherwise
    // block the report permanently.
    if (row.chunk_running) {
      const heldSince = row.chunk_started_at ? new Date(String(row.chunk_started_at)).getTime() : 0;
      const abandoned = heldSince > 0 && Date.now() - heldSince > CHUNK_LOCK_STALE_MS;
      if (!abandoned) {
        return NextResponse.json({ ok: true, alreadyRunning: true });
      }
      await admin.from("research_reports").update({ chunk_running: false }).eq("id", reportId);
    }

    if (!(await claimChunk(reportId))) {
      return NextResponse.json({ ok: true, alreadyRunning: true });
    }

    await admin
      .from("research_reports")
      .update({ chunk_count: (Number(row.chunk_count) || 0) + 1 })
      .eq("id", reportId);

    const outcome = await runResearchChunk({ reportId, apiKey, startedAt });
    return NextResponse.json({ ok: true, outcome });
  } catch (err) {
    logApiError("/api/research/[id]/continue", err, { reportId });
    try {
      const admin = createAdminClient();
      const { data } = await admin
        .from("research_reports")
        .select("user_id, reservation_id")
        .eq("id", reportId)
        .maybeSingle();
      if (data) {
        await failChunk(reportId, String(data.user_id), (data.reservation_id as string | null) ?? null);
      }
    } catch {
      // Nothing further to do — the poll endpoint's staleness check is the
      // final backstop.
    }
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
