import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { isFeatureOn } from "@/lib/flags/flags";
import { undoDescription, undoTarget, type VersionRow } from "@/lib/websites/undo";

export const dynamic = "force-dynamic";

/**
 * TAKE BACK THE LAST CHANGE TO A SITE (MASTER 16, package 10), behind the
 * switch "site-pages". Free: nothing is generated, a stored state is put
 * back. The history in website_versions decides which state
 * (lib/websites/undo.ts); the site's home page and its other pages come
 * back together, and one more version row records the undo. Nothing is
 * deleted. Ownership is the signed-in session's (RLS) for every read; the
 * site itself is written by the server only (migration
 * 20261015000000_agents_websites_server_written.sql), scoped to the owner,
 * and only while no change is being made to it — the same lock
 * api/websites/edit takes (editing_started_at), so an undo never lands in
 * the middle of an edit.
 *
 * Codes, not sentences: the Site says each in the reader's language.
 */
type UndoCode = "not_authenticated" | "not_enabled" | "not_found" | "busy" | "nothing_to_undo" | "failed";

/** The edit route's own lock lifetime: a claim older than this was abandoned. */
const EDIT_LOCK_MS = 2 * 60 * 1000;

function fail(code: UndoCode, status: number) {
  return NextResponse.json({ ok: false, code }, { status });
}

export async function POST(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return fail("not_authenticated", 401);
    if (!(await isFeatureOn("site-pages", user))) return fail("not_enabled", 403);

    const { data: site, error: siteError } = await supabase
      .from("user_websites")
      .select("id, status, editing_started_at")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (siteError) {
      logApiError("/api/websites/[id]/undo", siteError, { stage: "load_site", websiteId: params.id });
      return fail("failed", 500);
    }
    if (!site) return fail("not_found", 404);
    // A site being made or changed has no settled state to go back from.
    if (site.status !== "completed") return fail("busy", 409);
    const staleClaimCutoff = new Date(Date.now() - EDIT_LOCK_MS).toISOString();

    const { data: rows, error: historyError } = await supabase
      .from("website_versions")
      .select("id, created_at, version_number, change_description")
      .eq("website_id", site.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1000);
    if (historyError) {
      logApiError("/api/websites/[id]/undo", historyError, { stage: "load_history", websiteId: site.id });
      return fail("failed", 500);
    }
    const target = undoTarget((rows ?? []) as VersionRow[]);
    if (!target) return fail("nothing_to_undo", 409);

    const { data: restore, error: restoreError } = await supabase
      .from("website_versions")
      .select("html_content, pages")
      .eq("id", target.restore.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (restoreError || !restore || typeof restore.html_content !== "string" || !restore.html_content.trim()) {
      logApiError("/api/websites/[id]/undo", restoreError ?? new Error("version without html"), { stage: "load_version", websiteId: site.id });
      return fail("failed", 500);
    }
    const pages = Array.isArray(restore.pages) && restore.pages.length > 0 ? restore.pages : null;

    const { data: written, error: updateError } = await createAdminClient()
      .from("user_websites")
      .update({ html_content: restore.html_content, pages })
      .eq("id", site.id)
      .eq("user_id", user.id)
      .or(`editing_started_at.is.null,editing_started_at.lt.${staleClaimCutoff}`)
      .select("*");
    if (updateError) {
      logApiError("/api/websites/[id]/undo", updateError, { stage: "update_site", websiteId: site.id });
      return fail("failed", 500);
    }
    // No row: a change is being made to this site right now.
    const record = written?.[0];
    if (!record) return fail("busy", 409);

    // The undo is a row of its own, so the next undo goes back one further.
    const highest = Math.max(0, ...((rows ?? []) as VersionRow[]).map((r) => r.version_number));
    const { error: versionError } = await supabase.from("website_versions").insert({
      user_id: user.id,
      website_id: site.id,
      version_number: highest + 1,
      html_content: restore.html_content,
      pages,
      change_description: undoDescription(target.undoes),
    });
    if (versionError) {
      logApiError("/api/websites/[id]/undo", versionError, { stage: "insert_version", websiteId: site.id });
    }

    return NextResponse.json({ ok: true, record, undone: target.undoes.change_description ?? null });
  } catch (err) {
    logApiError("/api/websites/[id]/undo", err);
    return fail("failed", 500);
  }
}
