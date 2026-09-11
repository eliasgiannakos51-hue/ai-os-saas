import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logApiError } from "@/lib/log-error";
import { IN_PROJECT, PROJECTS_TABLE, isUuid } from "@/lib/projects/project";

/**
 * WHICH PROJECT A CONVERSATION IS IN — CHOSEN ONCE, READ EVER AFTER.
 *
 * The decision the brief made: a project is picked WHEN A CONVERSATION
 * STARTS, and there is no switch in the middle of one. The reason is the
 * prompt cache — the project decides the first thing in the prompt, and
 * moving it on message nine rewrites a prefix that nine messages were
 * cached against, so it would cost more than it saved.
 *
 * NO COLUMN WAS ADDED. `chat_conversations` is an existing table and this
 * round changes none, so the association is the same edge everything else
 * in a project is: entity_links, relationship_type 'in_project',
 * conversation -> project. That also means the delete trigger in
 * 20261001000000_projects.sql cleans it up with the rest, and deleting a
 * project leaves the conversation itself alone.
 *
 * So `/api/chat` writes the edge on the message that CREATES the
 * conversation and reads it on every message after: the client's
 * `projectId` is only ever honoured on the first one, and a later one
 * naming a different project changes nothing.
 */
export const CONVERSATIONS_TABLE = "chat_conversations";

/** The project this conversation was started in, or null. */
export async function projectOfConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string
): Promise<string | null> {
  if (!isUuid(conversationId)) return null;
  try {
    const { data, error } = await supabase
      .from("entity_links")
      .select("target_id")
      .eq("user_id", userId)
      .eq("relationship_type", IN_PROJECT)
      .eq("source_table", CONVERSATIONS_TABLE)
      .eq("source_id", conversationId)
      .eq("target_table", PROJECTS_TABLE)
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      if (error) logApiError("projects:projectOfConversation", error, { conversationId });
      return null;
    }
    const id = (data as { target_id?: unknown }).target_id;
    return isUuid(id) ? id : null;
  } catch (err) {
    logApiError("projects:projectOfConversation", err, { conversationId });
    return null;
  }
}

/**
 * The id back, if that project is the caller's own — otherwise null.
 *
 * The read is not decoration: entity_links has no foreign key to
 * public.projects and could not have one (its ends are any two tables),
 * so "this id is a project of mine" is a question only a read through the
 * person's own client can answer. `/api/chat` asks it BEFORE it builds
 * the context, because the context is what the answer costs.
 */
export async function ownedProjectId(
  supabase: SupabaseClient,
  projectId: string | null | undefined
): Promise<string | null> {
  if (!isUuid(projectId)) return null;
  try {
    const { data, error } = await supabase
      .from(PROJECTS_TABLE)
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (error || !data) {
      if (error) logApiError("projects:ownedProjectId", error, { projectId });
      return null;
    }
    return projectId;
  } catch (err) {
    logApiError("projects:ownedProjectId", err, { projectId });
    return null;
  }
}

/**
 * Write the membership edge for a conversation that has just been created.
 *
 * Called ONLY on the message that created it, and only with an id
 * `ownedProjectId` has already returned. A failure here is logged and
 * swallowed rather than returned: the context has already been built and
 * the answer is already being written, so failing the request over the
 * bookkeeping row would cost the person a message to fix nothing.
 */
export async function linkConversationToProject(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  projectId: string
): Promise<void> {
  if (!isUuid(projectId) || !isUuid(conversationId)) return;
  try {
    const { error } = await supabase.from("entity_links").insert({
      user_id: userId,
      source_table: CONVERSATIONS_TABLE,
      source_id: conversationId,
      target_table: PROJECTS_TABLE,
      target_id: projectId,
      relationship_type: IN_PROJECT,
    });
    if (error) logApiError("projects:linkConversationToProject", error, { conversationId, projectId });
  } catch (err) {
    logApiError("projects:linkConversationToProject", err, { conversationId, projectId });
  }
}
