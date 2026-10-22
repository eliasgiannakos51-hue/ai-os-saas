import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logApiError } from "@/lib/log-error";
import { checkColour, checkProjectName, clampGoal, isProjectStatus } from "@/lib/projects/project";

export const dynamic = "force-dynamic";

/**
 * CHANGING A PROJECT'S OWN FIELDS — name, goal, status, colours
 * (owner's message 2026-10-22, point 6: «όνομα, χρώματα, στόχος»).
 *
 * NOT THE SERVICE ROLE: `20261023100000_projects_site_versions_server_written.sql`
 * took back INSERT on `public.projects` and nothing else — UPDATE is
 * still the account's own, scoped by the `projects_update_own` policy
 * from the original migration. So this route uses the person's own
 * client throughout, exactly like the DELETE in `api/projects/route.ts`
 * beside it, and the `.eq("user_id", user.id)` on the update is
 * belt-and-braces on the same verb as that one.
 *
 * ONLY THE FOUR FIELDS, EACH VALIDATED BY THE SAME FUNCTIONS THE CREATE
 * ROUTE USES — a name or a goal typed here is held to the same limits as
 * one typed at creation, and a colour that is not exactly #rrggbb (or
 * empty, which clears it) is refused with 400 rather than reaching the
 * database's own CHECK as an opaque 500.
 */
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
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

  const patch: Record<string, unknown> = {};

  if (body.name !== undefined) {
    const verdict = checkProjectName(body.name);
    if (!verdict.ok) return NextResponse.json({ error: verdict.reason, limit: verdict.limit }, { status: 400 });
    patch.name = verdict.name;
  }
  if (body.goal !== undefined) patch.goal = clampGoal(body.goal);
  if (body.status !== undefined) {
    if (!isProjectStatus(body.status)) return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    patch.status = body.status;
  }
  if (body.primaryColour !== undefined) {
    const verdict = checkColour(body.primaryColour);
    if (!verdict.ok) return NextResponse.json({ error: "invalid_colour" }, { status: 400 });
    patch.primary_colour = verdict.colour;
  }
  if (body.secondaryColour !== undefined) {
    const verdict = checkColour(body.secondaryColour);
    if (!verdict.ok) return NextResponse.json({ error: "invalid_colour" }, { status: 400 });
    patch.secondary_colour = verdict.colour;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "nothing_to_change" }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, name, goal, status, primary_colour, secondary_colour, created_at")
      .maybeSingle();
    if (error) {
      logApiError("/api/projects/[id]", error, { stage: "update" });
      return NextResponse.json({ error: "update_failed" }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: "no_such_project" }, { status: 404 });
    return NextResponse.json({ ok: true, project: data });
  } catch (err) {
    logApiError("/api/projects/[id]", err);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
}
