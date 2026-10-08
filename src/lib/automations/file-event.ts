import "server-only";
import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { readFlow } from "@/lib/automations/boxes";

/** The most automations one upload starts. */
export const MAX_RUNS_PER_FILE = 5;

/**
 * A FILE FINISHED READING: every automation of this person that starts
 * «όταν ανεβάζω αρχείο» gets a queued run for it (MASTER 16, package 30).
 *
 * Called from lib/files/ingest.ts after the row is written, for a file
 * that was read. It only QUEUES — nothing here calls a model, so an
 * upload costs and waits exactly what it did. The runs are taken by
 * api/automations/events, which the screen that uploaded calls when the
 * answer says some were queued, and by the 15-minute cron
 * (api/cron/automation-flows) for every upload nobody's screen followed.
 *
 * It never fails the upload: an error is logged and counts as none queued.
 */
export async function queueFileRuns(user: User, fileId: string): Promise<number> {
  try {
    if (!(await isFeatureOn("automations", user))) return 0;
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("automation_flows")
      .select("id, boxes")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(50);
    if (error) {
      logApiError("automations:file-event", error, { stage: "load" });
      return 0;
    }
    const flows = (data ?? []).filter((row) => {
      const flow = readFlow(row.boxes);
      return flow.ok && flow.boxes[0].kind === "start" && flow.boxes[0].when === "file_uploaded";
    });
    if (flows.length === 0) return 0;
    const rows = flows.slice(0, MAX_RUNS_PER_FILE).map((flow) => ({
      flow_id: flow.id as string,
      user_id: user.id,
      started_by: "event",
      status: "queued",
      event_ref: fileId,
    }));
    const { error: insertError } = await admin.from("automation_runs").insert(rows);
    if (insertError) {
      logApiError("automations:file-event", insertError, { stage: "queue" });
      return 0;
    }
    return rows.length;
  } catch (err) {
    logApiError("automations:file-event", err);
    return 0;
  }
}
