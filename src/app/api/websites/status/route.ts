import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isGenerationJobStale } from "@/lib/website-generation-limits";
import { logApiError } from "@/lib/log-error";
import type { UserWebsite } from "@/types/user-website";

export const dynamic = "force-dynamic";

// Website Builder — job POLLING endpoint. The client hits this every
// 2-3 seconds (website-builder-workspace.tsx) for any website still in
// status "pending"/"processing", instead of holding one long-lived
// request open for the whole generation — each poll is a single, cheap,
// fast row read, so it can never itself time out the way one giant
// blocking request could. Also what a page reload uses to pick a
// still-processing generation back up without the user doing anything.
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required." }, { status: 400 });
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ ok: false, error: "Not authenticated." }, { status: 401 });
    }

    // RLS (select_own_user_websites) scopes this to the caller's own
    // row — a stranger's id simply won't be found.
    const { data: record, error } = await supabase
      .from("user_websites")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logApiError("/api/websites/status", error, { stage: "select" });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!record) {
      return NextResponse.json({ ok: false, error: "Website not found." }, { status: 404 });
    }

    // Stale-job cleanup — the fix for a generation getting stuck in
    // "pending"/"processing" forever with the client polling endlessly.
    // A row still in flight this long after created_at almost certainly
    // means the worker request (api/websites/generate/process) died
    // without ever reaching a terminal status — most likely the
    // platform's function execution timeout killing it mid-stream, which
    // skips every catch block and every status update this route relies
    // on. Every poll checks this, so the very next tick after a job goes
    // stale, the client sees 'failed' instead of spinning indefinitely.
    // No credits to refund here: deductCredits only ever runs AFTER
    // status flips to 'completed' (see the process route), so a row that
    // never left pending/processing structurally can't have been charged.
    const typedRecord = record as UserWebsite;
    if (
      isGenerationJobStale(
        typedRecord.status,
        typedRecord.created_at,
        new Date(),
        typedRecord.has_reference_images,
        typedRecord.is_large_request
      )
    ) {
      const { data: failedRecord, error: staleUpdateError } = await supabase
        .from("user_websites")
        .update({
          status: "failed",
          error_message: "Something went wrong generating your website — please try again. No credits were charged.",
        })
        // Conditioned on the status we just read, not just the id, so
        // this can never clobber a legitimate 'completed'/'failed'
        // written by the worker in the small window between our SELECT
        // above and this UPDATE.
        .eq("id", id)
        .eq("status", typedRecord.status)
        .select()
        .maybeSingle();

      if (staleUpdateError) {
        logApiError("/api/websites/status", staleUpdateError, { stage: "stale_job_update" });
      } else if (failedRecord) {
        logApiError("/api/websites/status", "stale website generation job force-failed", {
          websiteId: id,
          createdAt: typedRecord.created_at,
        });
        return NextResponse.json({ ok: true, record: failedRecord });
      }
      // failedRecord === null means the worker won the race and already
      // moved the row to a terminal status between our SELECT and this
      // UPDATE — the copy we read above is now stale, so re-fetch instead
      // of trusting it.
      const { data: freshRecord } = await supabase.from("user_websites").select("*").eq("id", id).maybeSingle();
      if (freshRecord) {
        return NextResponse.json({ ok: true, record: freshRecord });
      }
    }

    return NextResponse.json({ ok: true, record });
  } catch (err) {
    logApiError("/api/websites/status", err);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }
}
