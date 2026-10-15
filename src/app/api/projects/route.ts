import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { maxProjectsForPlan } from "@/lib/projects/project-limits";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { checkProjectName, clampGoal, isProjectStatus } from "@/lib/projects/project";

export const dynamic = "force-dynamic";

/**
 * CREATE AND DELETE A PROJECT — the folder, never the contents.
 *
 * THE CREATE IS THE SERVER'S, EVERYTHING ELSE IS THE PERSON'S OWN CLIENT.
 * Until 2026-10-08 this file had no admin client at all, on the reasoning
 * that a project is a name and not a receipt for work that cost money. The
 * plan's project cap is the part that reasoning missed: the cap is sold on
 * the pricing page, and a cap checked only here held only for requests
 * that came here. The account no longer holds INSERT on projects
 * (supabase/migrations/20261023100000_projects_site_versions_server_written.sql),
 * so the one write below goes through the service role, after the cap,
 * with user_id from the session. The count, the delete and every read stay
 * on the person's own client, so RLS still decides those.
 *
 * DELETE REMOVES THE FOLDER AND ITS MEMBERSHIP EDGES, and the edges go
 * through the database trigger (20261001000000_projects.sql), not through
 * a second statement here — a cleanup that lives in one route is a
 * cleanup that does not happen when a row is removed any other way.
 */
export async function POST(request: Request) {
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

  const verdict = checkProjectName(body.name);
  if (!verdict.ok) return NextResponse.json({ error: verdict.reason, limit: verdict.limit }, { status: 400 });

  // HOW MANY PROJECTS THIS PLAN ALLOWS, and until 2026-09-13 the answer
  // was "as many as you like, on every plan including Free" — the only
  // check here was on the NAME. Counted before the insert, with a HEAD
  // count so nothing is read but the number.
  //
  // RLS scopes the count to this user's own rows; the explicit user_id
  // filter is belt-and-braces and is also what makes the index usable.
  const projectCap = maxProjectsForPlan(await resolveEffectivePlanSlug(user));
  if (Number.isFinite(projectCap)) {
    const { count, error: countError } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    // FAILS CLOSED on a count that did not come back. A ceiling that
    // opens when the database hiccups is a ceiling an attacker reaches
    // by making the database hiccup — and the cost of being wrong here
    // is one refused project with a message, not a lost row.
    if (countError) {
      logApiError("/api/projects", countError, { stage: "count_projects" });
      return NextResponse.json({ error: "limit_check_failed" }, { status: 503 });
    }
    if ((count ?? 0) >= projectCap) {
      return NextResponse.json(
        { error: "project_limit_reached", limit: projectCap },
        { status: 402 }
      );
    }
  }

  try {
    const { data, error } = await createAdminClient()
      .from("projects")
      .insert({
        // FROM THE SESSION, NEVER FROM THE BODY. The service role checks
        // nothing, so this line is the whole of what makes the project the
        // caller's.
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
  const supabase = await createClient();
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
