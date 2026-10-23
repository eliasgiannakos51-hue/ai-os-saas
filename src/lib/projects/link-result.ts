import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { IN_PROJECT, PROJECTS_TABLE, isProjectMemberTable, isUuid } from "@/lib/projects/project";

export { ownedProjectId } from "@/lib/projects/conversation-scope";

/**
 * STARTING WORK FROM A PROJECT AUTO-JOINS IT (owner's message 2026-10-22,
 * point 6: «Από το Project ξεκινάς νέα δουλειά σε οποιοδήποτε εργαλείο,
 * και μπαίνει αυτόματα στο ίδιο Project»).
 *
 * THE SAME SHAPE AS lib/projects/conversation-scope.ts's
 * linkConversationToProject, generalised over the table — that file
 * stays conversation-only (its whole point is the chat's prompt cache,
 * §3 of docs/projects.md) and this one is for every OTHER tool: a site,
 * an automation, a research report. Each creation route reads an
 * optional `projectId` from its body, resolves it with `ownedProjectId`
 * (re-exported here so a route needs one import, not two) BEFORE it
 * spends anything, and calls this AFTER its own insert succeeds, with
 * the row the insert just made.
 *
 * SWALLOWS ITS OWN FAILURE, on purpose and the same reasoning as
 * `linkConversationToProject`: by the time this runs, the work itself
 * (a site, a report, an automation) has already been created and
 * possibly charged for. Failing the whole request over the bookkeeping
 * edge would cost the person a result they already paid for, to fix
 * nothing — the edge can always be added by hand afterwards, through the
 * universal "⋯ → Προσθήκη σε Project" menu every result carries.
 */
export async function linkResultToProject(
  supabase: SupabaseClient,
  userId: string,
  table: string,
  id: string,
  projectId: string
): Promise<void> {
  if (!isProjectMemberTable(table) || !isUuid(projectId) || typeof id !== "string" || !id) return;
  try {
    const { error } = await supabase.from("entity_links").insert({
      user_id: userId,
      source_table: table,
      source_id: id,
      target_table: PROJECTS_TABLE,
      target_id: projectId,
      relationship_type: IN_PROJECT,
    });
    if (error) logApiError("projects:linkResultToProject", error, { table, id, projectId });
  } catch (err) {
    logApiError("projects:linkResultToProject", err, { table, id, projectId });
  }
}
