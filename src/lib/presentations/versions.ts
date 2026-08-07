import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { MAX_VERSIONS_PER_PRESENTATION } from "@/lib/presentations/presentation-limits";
import type { Slide } from "@/lib/presentations/slides";

/**
 * Append a version and prune the oldest beyond the ceiling.
 *
 * BEST-EFFORT BY DESIGN, and this is the important part: it returns
 * whether it worked and never throws, because every caller has already
 * done the expensive thing by the time it runs. An AI edit that
 * succeeded, was paid for, and is now saved on the deck must not be
 * reported to the user as a failure because a history row would not
 * write. History is worth having; it is not worth losing the work it is
 * a history of.
 *
 * The version number is read-then-written rather than computed in the
 * database. Two concurrent edits can therefore both compute the same
 * next number — which is exactly why `unique (presentation_id,
 * version_number)` exists in the migration. The loser gets a constraint
 * violation and logs, rather than silently overwriting the other's
 * snapshot.
 */
export async function appendVersion(params: {
  supabase: SupabaseClient;
  presentationId: string;
  userId: string;
  title: string;
  slides: Slide[];
  changeSummary: string;
}): Promise<{ ok: boolean; versionNumber: number | null }> {
  const { supabase, presentationId, userId, title, slides, changeSummary } = params;

  try {
    const { data: latest, error: latestError } = await supabase
      .from("presentation_versions")
      .select("version_number")
      .eq("presentation_id", presentationId)
      .eq("user_id", userId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) {
      logApiError("presentations:appendVersion", latestError, { stage: "read_latest" });
      return { ok: false, versionNumber: null };
    }

    const versionNumber = (latest?.version_number ?? 0) + 1;

    const { error: insertError } = await supabase.from("presentation_versions").insert({
      presentation_id: presentationId,
      user_id: userId,
      version_number: versionNumber,
      title,
      slides,
      change_summary: changeSummary.slice(0, 300),
    });

    if (insertError) {
      logApiError("presentations:appendVersion", insertError, { stage: "insert", versionNumber });
      return { ok: false, versionNumber: null };
    }

    await pruneVersions({ supabase, presentationId, userId });
    return { ok: true, versionNumber };
  } catch (err) {
    logApiError("presentations:appendVersion", err, {});
    return { ok: false, versionNumber: null };
  }
}

/**
 * Keep only the newest MAX_VERSIONS_PER_PRESENTATION snapshots.
 *
 * Deleting the OLDEST is the only deletion allowed on an append-only
 * table, and it is done by id rather than by "version_number < n":
 * numbers are not contiguous once a prune has run, so a numeric
 * threshold drifts away from the count it is supposed to enforce.
 */
async function pruneVersions(params: {
  supabase: SupabaseClient;
  presentationId: string;
  userId: string;
}): Promise<void> {
  const { supabase, presentationId, userId } = params;

  const { data, error } = await supabase
    .from("presentation_versions")
    .select("id")
    .eq("presentation_id", presentationId)
    .eq("user_id", userId)
    .order("version_number", { ascending: false });

  if (error || !data || data.length <= MAX_VERSIONS_PER_PRESENTATION) return;

  const excess = data.slice(MAX_VERSIONS_PER_PRESENTATION).map((row) => row.id);
  if (excess.length === 0) return;

  const { error: deleteError } = await supabase
    .from("presentation_versions")
    .delete()
    .in("id", excess)
    .eq("user_id", userId);

  if (deleteError) {
    logApiError("presentations:pruneVersions", deleteError, { stage: "delete", count: excess.length });
  }
}
