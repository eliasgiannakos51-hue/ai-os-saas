import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkCronAuth } from "@/lib/cron-auth";
import { logApiError } from "@/lib/log-error";
import { runStorageCleanup } from "@/lib/websites/storage-cleanup";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
// A full sweep lists every user folder and reads five tables to the end.
// 300s is generous for the scale this runs at today and is the floor the
// app gives every long-running route; the marker is what scripts/tests/
// function-limits.test.mjs requires so the number is declared rather
// than inherited from whatever the platform tier happens to allow. A run
// cut off by it has deleted nothing: every read comes before any delete.
export const maxDuration = 300; // @function-limit 300

/**
 * Uploaded photographs that nothing needs any more.
 *
 * WHAT WAS HAPPENING. Deleting a website deletes a row, straight from the
 * browser. The images the owner uploaded for it stayed in Storage
 * forever. Nothing removed them, and nothing ever would have.
 *
 * WHY THIS AND NOT A CASCADE. A file is not owned by one site: the same
 * logo is uploaded once and used by four, and a version or a published
 * snapshot can still be serving a photograph whose draft is long gone. A
 * database cascade knows about rows; the question here is whether any
 * DOCUMENT still embeds the URL. So the rule is "referenced by nothing",
 * decided in lib/websites/orphan-images.ts where it can be tested without
 * deleting anything.
 *
 * THE READS AND THE DELETES live in lib/websites/storage-cleanup.ts:
 * every in-use read is paged to the end and counted, any incomplete read
 * deletes nothing, and a run that would delete more than a small share
 * of the bucket stops and is reported here instead.
 *
 * DRY RUN BY DEFAULT is deliberately NOT the case — a cleanup nobody runs
 * is the state this replaces. It deletes, and it reports what it kept and
 * why, so the first run can be read rather than trusted. `?dry=1` reports
 * without deleting.
 *
 * Auth: CRON_SECRET, fail-closed, same as every other cron route.
 */
export async function GET(request: Request) {
  const auth = checkCronAuth(request);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";
  const admin = createAdminClient();

  try {
    const report = await runStorageCleanup(admin, { nowMs: Date.now(), dryRun });
    if (!report.ok) {
      // Logged, so it reaches the owner's error list rather than only the
      // cron's response body, which nobody reads.
      logApiError("/api/cron/website-storage-cleanup", new Error("cleanup stopped: over the deletion ceiling"), {
        stage: "ceiling",
        wouldDelete: report.wouldDelete,
        scanned: report.scanned,
        ceiling: report.ceiling,
      });
      return NextResponse.json(report, { status: 409 });
    }
    return NextResponse.json(report);
  } catch (err) {
    logApiError("/api/cron/website-storage-cleanup", err);
    return NextResponse.json({ ok: false, error: "Cleanup failed." }, { status: 500 });
  }
}
