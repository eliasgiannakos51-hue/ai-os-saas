import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { IN_PROJECT, MAX_MEMBERS, PROJECTS_TABLE, isProjectMemberTable } from "@/lib/projects/project";

export const dynamic = "force-dynamic";

/**
 * PUT A ROW IN A PROJECT, OR TAKE IT OUT — one level, explicitly.
 *
 * THE PROJECT IS READ BACK BEFORE ANYTHING IS WRITTEN, through the
 * person's own client. RLS already makes another account's project
 * invisible, so the read returns nothing and this route answers 404 — the
 * same answer it gives for a project that does not exist, which is the
 * right answer for both: "there is no such project FOR YOU" leaks
 * nothing about whether one exists for somebody else.
 *
 * REMOVING A MEMBER DELETES THE EDGE AND NOTHING ELSE. There is no path
 * in this file that touches the member row itself, and
 * scripts/tests/projects.test.mjs reads this file for the absence.
 *
 * AND THE MEMBER IS READ BACK TOO, WHICH IT WAS NOT UNTIL 2026-10-15.
 * The route validated the TABLE NAME and then inserted whatever id it
 * was handed. entity_links has no foreign key on either end — it cannot,
 * it links across twenty-odd tables — so nothing downstream would have
 * rejected another account's id, and the row would sit in this person's
 * project claiming a membership they do not own. RLS never saw a
 * problem: the edge's own user_id is the caller's. The read below is
 * therefore the ONLY thing standing between "put this in my project" and
 * "put THAT in my project", and it is the same read api/flows/[id]/steps
 * already does for the same reason.
 *
 * A SECOND ADD IS A MOVE, NOT A SECOND MEMBERSHIP. The old edge for this
 * row is deleted before the new one is written. Two reasons, and the
 * second is the one that bites: projects/page.tsx counts RAW edges for
 * its "N things" badge, so a duplicate inflates it; and
 * lib/projects/conversation-scope.ts reads a conversation's project with
 * .limit(1).maybeSingle(), so a conversation in two projects is scoped
 * to an ARBITRARY one of them, silently, on its next message.
 */
async function loadOwnProject(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, id: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  return data;
}

/** The member row, only if it is this account's. Null for anything else,
 *  including a row that does not exist and a row that is someone's
 *  else's — the caller cannot tell those apart, which is the point. */
async function ownsMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  table: string,
  memberId: string
): Promise<boolean> {
  const { data, error } = await supabase.from(table).select("id").eq("id", memberId).eq("user_id", userId).maybeSingle();
  if (error) {
    logApiError("/api/projects/[id]/members", error, { stage: "own_member", table });
    return false;
  }
  return Boolean(data);
}

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const table = body.table;
  const memberId = typeof body.id === "string" ? body.id : "";
  if (!isProjectMemberTable(table) || !memberId) {
    return NextResponse.json({ error: "not_linkable" }, { status: 400 });
  }

  try {
    const project = await loadOwnProject(supabase, user.id, params.id);
    if (!project) return NextResponse.json({ error: "no_such_project" }, { status: 404 });

    if (!(await ownsMember(supabase, user.id, String(table), memberId))) {
      return NextResponse.json({ error: "no_such_member" }, { status: 404 });
    }

    const { count } = await supabase
      .from("entity_links")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("relationship_type", IN_PROJECT)
      .eq("target_table", PROJECTS_TABLE)
      .eq("target_id", params.id);
    if ((count ?? 0) >= MAX_MEMBERS) {
      return NextResponse.json({ error: "project_full", limit: MAX_MEMBERS }, { status: 400 });
    }

    // THE MOVE. Every edge this row already has to a project goes first,
    // so adding is idempotent and re-filing is one membership rather
    // than two. entity_links has no UPDATE policy and no UPDATE grant
    // (the baseline creates select/insert/delete only), so repointing an
    // edge with .update() would change zero rows and report no error —
    // delete-then-insert is not a style choice here.
    const { error: clearError } = await supabase
      .from("entity_links")
      .delete()
      .eq("user_id", user.id)
      .eq("relationship_type", IN_PROJECT)
      .eq("source_table", String(table))
      .eq("source_id", memberId)
      .eq("target_table", PROJECTS_TABLE);
    if (clearError) {
      logApiError("/api/projects/[id]/members", clearError, { stage: "clear_previous" });
      return NextResponse.json({ error: "add_failed" }, { status: 500 });
    }

    const { error } = await supabase.from("entity_links").insert({
      user_id: user.id,
      source_table: String(table),
      source_id: memberId,
      target_table: PROJECTS_TABLE,
      target_id: params.id,
      relationship_type: IN_PROJECT,
    });
    if (error) {
      logApiError("/api/projects/[id]/members", error, { stage: "insert" });
      return NextResponse.json({ error: "add_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/projects/[id]/members", err);
    return NextResponse.json({ error: "add_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const url = new URL(request.url);
  const table = url.searchParams.get("table");
  const memberId = url.searchParams.get("id");
  if (!isProjectMemberTable(table) || !memberId) {
    return NextResponse.json({ error: "not_linkable" }, { status: 400 });
  }

  try {
    const project = await loadOwnProject(supabase, user.id, params.id);
    if (!project) return NextResponse.json({ error: "no_such_project" }, { status: 404 });

    // ONLY THE EDGE. The member row is not named anywhere in this
    // statement and not read anywhere in this file.
    const { error } = await supabase
      .from("entity_links")
      .delete()
      .eq("user_id", user.id)
      .eq("relationship_type", IN_PROJECT)
      .eq("target_table", PROJECTS_TABLE)
      .eq("target_id", params.id)
      .eq("source_table", table)
      .eq("source_id", memberId);
    if (error) {
      logApiError("/api/projects/[id]/members", error, { stage: "delete" });
      return NextResponse.json({ error: "remove_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/projects/[id]/members", err);
    return NextResponse.json({ error: "remove_failed" }, { status: 500 });
  }
}
