import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { collectAgentBatches } from "@/lib/ai/batch/agent-batch";
import { batchEnabled } from "@/lib/ai/batch/batch-policy";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // @function-limit 300

// Collects scheduled agent runs that were submitted to the Batch API
// (V4 #13), settles the ones that came back, and hands the rest to the
// ordinary synchronous path.
//
// A SEPARATE CRON FROM api/cron/agent-runs, deliberately. That one is a
// 15-minute tick whose job is to START work and whose worst case is
// spending money; this one only ever FINISHES work that was already
// submitted, and its worst case is a batch sitting uncollected for an
// extra few minutes. Folding them together would put a poll of every
// outstanding batch in front of every execution, on a route that already
// has a 300-second ceiling to fit forty agents into.
//
// IT KEEPS RUNNING WHEN BATCHING IS TURNED OFF. AI_BATCH_ENABLED being
// false stops new submissions; it must not strand the ones already out.
// A deployment that disables batching mid-flight still has queued rows,
// and the only thing worse than a slow result is one that never arrives
// because the collector decided it was not its job any more.
//
// AUTH. CRON_SECRET through the same fail-closed guard as the other
// scheduler routes: an unauthenticated call here would settle charges
// against other people's accounts.

export async function GET(request: Request) {
  try {
    const auth = checkCronAuth(request);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "ANTHROPIC_API_KEY is not configured on the server." },
        { status: 500 }
      );
    }

    const admin = createAdminClient();
    const summary = await collectAgentBatches({ admin, apiKey });

    return NextResponse.json({
      ok: true,
      ...summary,
      // Reported rather than acted on: see the note above about why this
      // route still runs with batching disabled.
      submissionsEnabled: batchEnabled(process.env),
    });
  } catch (err) {
    logApiError("/api/cron/agent-batches", err, { stage: "unhandled" });
    return NextResponse.json({ ok: false, error: "Batch collection failed." }, { status: 500 });
  }
}
