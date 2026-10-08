import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logApiError } from "@/lib/log-error";
import { checkRateLimit } from "@/lib/rate-limit";
import { isFeatureOn } from "@/lib/flags/flags";
import { resolveEffectivePlan, resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxProjectsForPlan } from "@/lib/projects/project-limits";
import { checkProjectName } from "@/lib/projects/project";
import { MAX_FLOW_SAID, planFlow, projectNameFor, withoutUnavailable } from "@/lib/flows/plan";
import { flowAvailability } from "@/lib/flows/availability";
import { readColour } from "@/lib/flows/brief";

export const dynamic = "force-dynamic";

/**
 * A FLOW, APPROVED (MASTER 6.1 and 6.3; MASTER 16 package 36), behind the
 * switch "flows".
 *
 * The screen has already shown the plan and its total (lib/flows/plan.ts,
 * lib/flows/flow-pricing.ts); pressing «Έγκριση» lands here. The plan is
 * made again HERE, from the sentence, rather than taken from the browser:
 * what runs is what this sentence means, not what a request says it means.
 * A sentence that needs a tool that does not exist yet starts nothing.
 *
 * It makes the PROJECT the results go into — under the plan's own project
 * cap, as api/projects does — and the flow row that follows the steps.
 * Nothing here calls a model or charges: each step is its own tool's
 * request, charged by that tool.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_body" }, { status: 400 });
  }
  const said = typeof body.said === "string" ? body.said.trim() : "";
  if (said.length < 3) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
  if (said.length > MAX_FLOW_SAID) return NextResponse.json({ ok: false, code: "too_long", limit: MAX_FLOW_SAID }, { status: 400 });
  const colour = readColour(body.colour);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, code: "not_signed_in" }, { status: 401 });
  if (!(await isFeatureOn("flows", user))) return NextResponse.json({ ok: false, code: "not_enabled" }, { status: 403 });
  const limited = await checkRateLimit({ scope: "flow_create", identifier: user.id, maxAttempts: 30, windowMinutes: 60 });
  if (!limited.allowed) return NextResponse.json({ ok: false, code: "rate_limited" }, { status: 429 });

  const available = await flowAvailability(user, await resolveEffectivePlan(user));
  const plan = withoutUnavailable(planFlow(said), (kind) => available[kind]);
  if (plan.steps.length === 0) {
    const code = plan.notYet.length > 0 ? "not_yet" : plan.unavailable.length > 0 ? "unavailable" : "nothing";
    return NextResponse.json({ ok: false, code, notYet: plan.notYet, unavailable: plan.unavailable }, { status: 422 });
  }

  try {
    const cap = maxProjectsForPlan(await resolveEffectivePlanSlug(user));
    if (Number.isFinite(cap)) {
      const { count, error: countError } = await supabase.from("projects").select("id", { count: "exact", head: true }).eq("user_id", user.id);
      if (countError) {
        logApiError("/api/flows", countError, { stage: "count_projects" });
        return NextResponse.json({ ok: false, code: "limit_check_failed" }, { status: 503 });
      }
      if ((count ?? 0) >= cap) return NextResponse.json({ ok: false, code: "project_limit_reached", limit: cap }, { status: 402 });
    }
    const name = checkProjectName(projectNameFor(said));
    if (!name.ok) return NextResponse.json({ ok: false, code: "empty" }, { status: 400 });
    // The project through the person's own client, as api/projects makes it.
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: name.name, goal: said.slice(0, 500), status: "active" })
      .select("id, name")
      .single();
    if (projectError || !project) {
      logApiError("/api/flows", projectError ?? new Error("no project"), { stage: "project" });
      return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
    }
    const { data: flow, error: flowError } = await createAdminClient()
      .from("project_flows")
      .insert({ user_id: user.id, project_id: project.id, said, colour, plan: { steps: plan.steps, notYet: plan.notYet }, steps: {}, status: "running" })
      .select("id, project_id, said, colour, plan, steps, status, created_at")
      .single();
    if (flowError || !flow) {
      logApiError("/api/flows", flowError ?? new Error("no flow"), { stage: "flow" });
      return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, flow, project, unavailable: plan.unavailable });
  } catch (err) {
    logApiError("/api/flows", err);
    return NextResponse.json({ ok: false, code: "save_failed" }, { status: 500 });
  }
}
