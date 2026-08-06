import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/dashboard/page-header";
import { ErrorMessage } from "@/components/error-message";
import { UpgradeRequired } from "@/components/billing/upgrade-required";
import { MODULE_ICONS } from "@/lib/module-icons";
import { isAdminEmail } from "@/lib/admin";
import { resolveEffectivePlanSlug } from "@/lib/billing/credits";
import { maxAgentsForPlan, DEFAULT_AGENT_LIMITS } from "@/lib/agents/agent-limits";
import { AgentsWorkspace } from "@/components/agents/agents-workspace";
import type { AgentRun, UserAgent } from "@/lib/agents/agent-config";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AI Agents" };

// Autonomous Agents.
//
// This route used to render the `ai_agents` Build-module TRACKER — a row
// the user typed by hand, that never did anything. It now renders the real
// feature. `ai_agents` is left in the database untouched, exactly as
// `ai_documents` was when the Documents module replaced it at
// /dashboard/documents; nothing has been deleted, it is simply no longer
// the thing this route shows.
//
// How many runs to load for the history panel. Enough to answer "has this
// been working?" for every agent on the page without an N+1 per-agent
// query — one query, filtered client-side by agent.
const RUN_HISTORY_LIMIT = 60;

export default async function AgentsPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const t = await getTranslations("dashboard.agents");
  const isAdmin = isAdminEmail(user.email);
  const planSlug = await resolveEffectivePlanSlug(user);
  const planCap = maxAgentsForPlan(planSlug);

  if (!isAdmin && planCap <= 0) {
    return (
      <main className="min-h-full bg-dot-grid">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <PageHeader icon={MODULE_ICONS.agents} title={t("title")} description={t("description")} />
          <UpgradeRequired featureName={t("title")} planName="Starter" />
        </div>
      </main>
    );
  }

  // RLS scopes both reads to this user's own rows; the explicit user_id
  // filter is belt-and-braces, and it is also what makes the composite
  // indexes on (user_id, ...) usable.
  const [{ data: agents, error: agentsError }, { data: runs, error: runsError }] = await Promise.all([
    supabase
      .from("user_agents")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("agent_runs")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(RUN_HISTORY_LIMIT),
  ]);

  // An admin is not capped, but the workspace needs a number to display
  // and to disable "+ New" against. The highest published allowance is the
  // honest one to show.
  const cap = isAdmin ? Math.max(planCap, DEFAULT_AGENT_LIMITS.enterprise) : planCap;

  return (
    <main className="min-h-full bg-dot-grid">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
        <PageHeader icon={MODULE_ICONS.agents} title={t("title")} description={t("description")} />

        {/* EU AI Act Article 50 — the user has to know they are configuring
            an AI system and that everything it sends them is AI-generated.
            Stated once, on the surface where agents are created, in
            addition to the notice carried by every delivered email. */}
        <p className="mb-4 rounded-xl border border-border bg-panel/60 p-3 text-[11px] leading-relaxed text-muted">
          {t("aiDisclosure")}
        </p>

        {agentsError && <ErrorMessage message={`loading agents: ${agentsError.message}`} />}
        {runsError && <ErrorMessage message={`loading agent runs: ${runsError.message}`} />}

        <AgentsWorkspace
          agents={(agents as UserAgent[] | null) ?? []}
          runs={(runs as AgentRun[] | null) ?? []}
          agentCap={cap}
          accountEmail={user.email ?? ""}
        />
      </div>
    </main>
  );
}
