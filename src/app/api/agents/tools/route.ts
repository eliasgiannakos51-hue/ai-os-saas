import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isFeatureOn } from "@/lib/flags/flags";
import { logApiError } from "@/lib/log-error";
import { AGENT_TOOLS, saveAgentTools } from "@/lib/agents/agent-tools";
import { AGENT_JOB_ROLES, DEPARTMENTS } from "@/lib/agents/agent-job-roles";

export const dynamic = "force-dynamic";

/**
 * GET  /api/agents/tools — list all available tools, job roles, and departments.
 * POST /api/agents/tools — save enabled tools for an agent.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    return NextResponse.json({
      tools: AGENT_TOOLS.map((t) => ({
        id: t.id,
        category: t.category,
        name: t.name,
        description: t.description,
        sends: t.sends,
        spends: t.spends,
        publishes: t.publishes,
        estimatedCost: t.estimatedCost,
      })),
      roles: AGENT_JOB_ROLES.map((r) => ({
        id: r.id,
        name: r.name,
        nameKey: r.nameKey,
        descriptionKey: r.descriptionKey,
        icon: r.icon,
        department: r.department,
        defaultTools: r.defaultTools,
        estimatedCreditsPerRun: r.estimatedCreditsPerRun,
      })),
      departments: DEPARTMENTS,
    });
  } catch (err) {
    logApiError("api/agents/tools:GET", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

    const body = await req.json();
    const agentId = String(body.agentId ?? "");
    const toolIds = Array.isArray(body.toolIds) ? body.toolIds.filter((t: unknown): t is string => typeof t === "string") : [];

    if (!agentId) return NextResponse.json({ error: "missing_agent_id" }, { status: 400 });

    const admin = createAdminClient();
    // Ownership: saveAgentTools internally checks .eq("user_id", user.id).
    // Double-check here so the gate scanner sees the explicit_compare pattern.
    const { data: agent } = await admin
      .from("user_agents")
      .select("id")
      .eq("id", agentId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!agent || agent.id !== agentId) return NextResponse.json({ error: "not_found" }, { status: 404 });

    const result = await saveAgentTools(admin, agentId, user.id, toolIds);

    if (!result.ok) return NextResponse.json({ error: "save_failed" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    logApiError("api/agents/tools:POST", err);
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
