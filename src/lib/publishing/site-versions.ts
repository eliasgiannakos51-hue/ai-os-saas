import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { MAX_SITE_VERSIONS } from "@/lib/publishing/publish-limits";
import { logApiError } from "@/lib/log-error";

// Shared history helpers for the LIVE site (site_versions), used by the
// publish, rollback and live-edit routes. Extracted so the three cannot
// drift — a prune that kept 20 in one place and 30 in another would make
// "max 20 versions" a lie in exactly the route the user reached for.

type Db = ReturnType<typeof createClient>;

/** The next version number for a live site: one past the highest, or 1. */
export async function nextSiteVersion(supabase: Db, publishedSiteId: string): Promise<number> {
  const { data } = await supabase
    .from("site_versions")
    .select("version_number")
    .eq("published_site_id", publishedSiteId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.version_number ?? 0) + 1;
}

/** Keeps the newest MAX_SITE_VERSIONS. Each version is a full HTML copy,
 *  so an unbounded history is a table of megabyte rows every dashboard
 *  query steps over. Best-effort: a failed prune never fails the edit. */
export async function pruneSiteVersions(supabase: Db, publishedSiteId: string): Promise<void> {
  const { data } = await supabase
    .from("site_versions")
    .select("id")
    .eq("published_site_id", publishedSiteId)
    .order("version_number", { ascending: false })
    .range(MAX_SITE_VERSIONS, MAX_SITE_VERSIONS + 200);
  const ids = (data ?? []).map((row) => row.id);
  if (ids.length === 0) return;
  const { error } = await supabase.from("site_versions").delete().in("id", ids);
  if (error) logApiError("site-versions:prune", error, { publishedSiteId });
}
