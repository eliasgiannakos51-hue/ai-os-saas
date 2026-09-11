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
 */
async function loadOwnProject(supabase: ReturnType<typeof createClient>, userId: string, id: string) {
  const { data } = await supabase.from("projects").select("id").eq("id", id).eq("user_id", userId).maybeSingle();
  return data;
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
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

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
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
