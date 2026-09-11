import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkProjectName, clampGoal, isProjectStatus } from "@/lib/projects/project";

export const dynamic = "force-dynamic";

/**
 * CREATE AND DELETE A PROJECT — the folder, never the contents.
 *
 * EVERY QUERY HERE GOES THROUGH THE PERSON'S OWN CLIENT, so RLS is what
 * decides, not a filter this file remembers to write. There is no admin
 * client in this file on purpose: a project is a name the person chose,
 * not a receipt for work that cost money, so there is nothing here that
 * needs the service role and nothing to forge by creating one.
 *
 * DELETE REMOVES THE FOLDER AND ITS MEMBERSHIP EDGES, and the edges go
 * through the database trigger (20261001000000_projects.sql), not through
 * a second statement here — a cleanup that lives in one route is a
 * cleanup that does not happen when a row is removed any other way.
 */
export async function POST(request: Request) {
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

  const verdict = checkProjectName(body.name);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason, limit: verdict.limit }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("projects")
      .insert({
        // FROM THE SESSION, NEVER FROM THE BODY. The insert policy would
        // refuse a foreign user_id anyway; writing it from the session
        // means the route never even asks the question.
        user_id: user.id,
        name: verdict.name,
        goal: clampGoal(body.goal),
        status: isProjectStatus(body.status) ? body.status : "active",
      })
      .select("id, name, goal, status, created_at")
      .single();
    if (error) {
      logApiError("/api/projects", error, { stage: "insert" });
      return NextResponse.json({ error: "create_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, project: data });
  } catch (err) {
    logApiError("/api/projects", err);
    return NextResponse.json({ error: "create_failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_signed_in" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  try {
    // .eq("user_id") AS WELL AS the delete policy. Belt and braces on the
    // one verb that cannot be undone: the policy is the guarantee, the
    // predicate is what makes the guarantee visible in this file.
    const { error } = await supabase.from("projects").delete().eq("id", id).eq("user_id", user.id);
    if (error) {
      logApiError("/api/projects", error, { stage: "delete" });
      return NextResponse.json({ error: "delete_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("/api/projects", err);
    return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  }
}
